package com.hukang.local
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.os.SystemClock
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import java.io.File
import java.io.InputStream
import java.util.concurrent.Executors
import kotlin.math.ceil
import kotlin.math.floor
class HuKangOcrModule(private val context:ReactApplicationContext):ReactContextBaseJavaModule(context){
 private val imageWorker=Executors.newSingleThreadExecutor()
 private val provider="mlkit-chinese-bundled-16.0.1"
 override fun invalidate(){imageWorker.shutdown();super.invalidate()}
 private fun openImage(uri:String):InputStream {
  val parsed=Uri.parse(uri)
  return if(parsed.scheme==null)File(uri).inputStream()
   else context.contentResolver.openInputStream(parsed)?:throw IllegalArgumentException("Cannot open image")
 }
 private fun bounds(uri:String):BitmapFactory.Options=BitmapFactory.Options().apply {
  inJustDecodeBounds=true
  openImage(uri).use {BitmapFactory.decodeStream(it,null,this)}
  require(outWidth>0&&outHeight>0){"Cannot decode image dimensions"}
 }
 private fun decodeBounded(uri:String):Pair<Bitmap,Int> {
  val size=bounds(uri)
  // Two ARGB buffers can coexist during rotation. Do not shrink every image to 2400px.
  val maxPixels=minOf(16_000_000L,Runtime.getRuntime().maxMemory()/16)
  var sample=1
  while((size.outWidth.toLong()/sample)*(size.outHeight.toLong()/sample)>maxPixels ||
    maxOf(size.outWidth,size.outHeight)/sample>8192)sample*=2
  val options=BitmapFactory.Options().apply{inSampleSize=sample;inPreferredConfig=Bitmap.Config.ARGB_8888}
  val bitmap=openImage(uri).use{BitmapFactory.decodeStream(it,null,options)}
    ?:throw IllegalArgumentException("Cannot decode image pixels")
  return Pair(bitmap,sample)
 }
 private fun saveJpeg(bitmap:Bitmap,prefix:String):File {
  val dir=File(context.filesDir,"scans")
  require(dir.exists()||dir.mkdirs()){"Cannot create scan directory"}
  val output=File.createTempFile(prefix,".jpg",dir)
  try {
   output.outputStream().use{require(bitmap.compress(Bitmap.CompressFormat.JPEG,97,it)){"JPEG encoding failed"}}
   require(output.length()>0){"Empty processed image"}
   ExifInterface(output).apply{setAttribute(ExifInterface.TAG_ORIENTATION,"1");saveAttributes()}
   return output
  }catch(error:Exception){output.delete();throw error}
 }
 private fun savePng(bitmap:Bitmap,prefix:String):File {
  val dir=File(context.filesDir,"scans")
  require(dir.exists()||dir.mkdirs()){"Cannot create scan directory"}
  val output=File.createTempFile(prefix,".png",dir)
  try {
   output.outputStream().use{require(bitmap.compress(Bitmap.CompressFormat.PNG,100,it)){"PNG encoding failed"}}
   require(output.length()>0){"Empty benchmark image"}
   return output
  }catch(error:Exception){output.delete();throw error}
 }
 override fun getName()="HuKangOcr"
 @ReactMethod fun normalizeImage(uri:String,promise:Promise){
  imageWorker.execute {
   var decoded:Bitmap?=null
   var upright:Bitmap?=null
   try {
    val orientation=openImage(uri).use{ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION,1)}.let{if(it in 1..8)it else 1}
    val (bitmap,sample)=decodeBounded(uri)
    decoded=bitmap
    val matrix=Matrix().apply {
     when(orientation){
      2->setScale(-1f,1f)
      3->setRotate(180f)
      4->setScale(1f,-1f)
      // Transpose/transverse include mirroring, not just a 90-degree turn.
      5->setValues(floatArrayOf(0f,1f,0f,1f,0f,0f,0f,0f,1f))
      6->setRotate(90f)
      7->setValues(floatArrayOf(0f,-1f,0f,-1f,0f,0f,0f,0f,1f))
      8->setRotate(270f)
     }
    }
    val result=if(orientation==1)bitmap else Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true)
    upright=result
    val output=saveJpeg(result,"upright-")
    val steps=Arguments.createArray().apply {
     if(orientation!=1)pushString("exif_orientation_$orientation")
     if(sample>1)pushString("memory_downsample_$sample")
     pushString("jpeg_quality_97")
    }
    promise.resolve(Arguments.createMap().apply {
     putString("uri",Uri.fromFile(output).toString());putInt("width",result.width);putInt("height",result.height)
     putInt("sourceOrientation",orientation);putInt("orientation",1);putArray("steps",steps)
    })
   }catch(error:OutOfMemoryError){promise.reject("IMAGE_MEMORY_LIMIT","Image too large for this device",error)}
    catch(error:Exception){promise.reject("IMAGE_PREPROCESS_FAILED",error)}
   finally{if(upright!==decoded)upright?.recycle();decoded?.recycle()}
  }
 }
 @ReactMethod fun recognize(uri:String,promise:Promise){try{val image=InputImage.fromFilePath(context,Uri.parse(uri));val client=TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build());client.process(image).addOnSuccessListener{client.close();promise.resolve(it.text)}.addOnFailureListener{client.close();promise.reject("OCR_FAILED",it)}}catch(e:Exception){promise.reject("OCR_IMAGE_FAILED",e)}}
 @ReactMethod fun recognizeDetailed(uri:String,promise:Promise){
  imageWorker.execute {
   val started=SystemClock.elapsedRealtime()
   var opened:TextRecognizer?=null
   try {
    val client=TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
    opened=client
    val parsed=Uri.parse(uri).let{if(it.scheme==null)Uri.fromFile(File(uri))else it}
    val image=InputImage.fromFilePath(context,parsed)
    client.process(image).addOnSuccessListener {result->
     try {
      val lines=Arguments.createArray()
      for(block in result.textBlocks)for(line in block.lines){
       val box=line.boundingBox?:continue
       lines.pushMap(Arguments.createMap().apply {
        putString("text",line.text)
        val score=line.confidence.toDouble()
        if(score.isFinite()&&score>0)putDouble("confidence",score)else putNull("confidence")
        putInt("left",box.left);putInt("top",box.top);putInt("right",box.right);putInt("bottom",box.bottom)
       })
      }
      promise.resolve(Arguments.createMap().apply {
       putString("text",result.text);putArray("lines",lines);putString("provider",provider)
       putDouble("durationMs",(SystemClock.elapsedRealtime()-started).toDouble())
       putInt("width",image.width);putInt("height",image.height)
      })
     }catch(error:Exception){promise.reject("OCR_RESULT_FAILED",error)}finally{client.close()}
    }.addOnFailureListener {error->client.close();promise.reject("OCR_FAILED",error)}
   }catch(error:OutOfMemoryError){opened?.close();promise.reject("OCR_MEMORY_LIMIT","Image too large for OCR",error)}
    catch(error:Exception){opened?.close();promise.reject("OCR_IMAGE_FAILED",error)}
  }
 }
 // Benchmark only. These variants never enter production recognition or a merge.
 // All outputs share one decoded/upright bitmap so JPEG/PNG differs only in encoding,
 // while whole/exact/padded PNG compares crop context without another lossy encoding.
 @ReactMethod fun createBenchmarkImages(uri:String,crop:ReadableMap,promise:Promise){
  imageWorker.execute {
   var decoded:Bitmap?=null
   var upright:Bitmap?=null
   val cropped=mutableListOf<Bitmap>()
   val files=mutableListOf<File>()
   try {
    val orientation=openImage(uri).use{ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION,1)}.let{if(it in 1..8)it else 1}
    val size=bounds(uri)
    val (bitmap,sample)=decodeBounded(uri)
    decoded=bitmap
    val matrix=Matrix().apply {
     when(orientation){
      2->setScale(-1f,1f);3->setRotate(180f);4->setScale(1f,-1f)
      5->setValues(floatArrayOf(0f,1f,0f,1f,0f,0f,0f,0f,1f));6->setRotate(90f)
      7->setValues(floatArrayOf(0f,-1f,0f,-1f,0f,0f,0f,0f,1f));8->setRotate(270f)
     }
    }
    val image=if(orientation==1)bitmap else Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true)
    upright=image
    // Crop coordinates are upright source pixels, matching the manually annotated ROI.
    val sourceWidth=if(orientation in 5..8)size.outHeight else size.outWidth
    val sourceHeight=if(orientation in 5..8)size.outWidth else size.outHeight
    val x=crop.getDouble("originX");val y=crop.getDouble("originY")
    val width=crop.getDouble("width");val height=crop.getDouble("height")
    require(listOf(x,y,width,height).all{it.isFinite()}&&x>=0&&y>=0&&width>=1&&height>=1&&x+width<=sourceWidth&&y+height<=sourceHeight){"Invalid benchmark crop"}
    val sx=image.width.toDouble()/sourceWidth;val sy=image.height.toDouble()/sourceHeight
    fun region(padding:Double):IntArray {
     val left=floor(maxOf(0.0,x-width*padding)*sx).toInt()
     val top=floor(maxOf(0.0,y-height*padding)*sy).toInt()
     val right=ceil(minOf(sourceWidth.toDouble(),x+width+width*padding)*sx).toInt().coerceAtMost(image.width)
     val bottom=ceil(minOf(sourceHeight.toDouble(),y+height+height*padding)*sy).toInt().coerceAtMost(image.height)
     require(right>left&&bottom>top){"Empty benchmark crop after sampling"}
     return intArrayOf(left,top,right-left,bottom-top)
    }
    val exact=region(0.0);val padded=region(0.1)
    fun cut(region:IntArray):Bitmap=Bitmap.createBitmap(image,region[0],region[1],region[2],region[3]).also{if(it!==image)cropped.add(it)}
    fun output(bitmap:Bitmap,name:String,jpeg:Boolean,region:IntArray?):WritableMap {
     val file=if(jpeg)saveJpeg(bitmap,"benchmark-$name-")else savePng(bitmap,"benchmark-$name-")
     files.add(file)
     return Arguments.createMap().apply {
      putString("uri",Uri.fromFile(file).toString());putInt("width",bitmap.width);putInt("height",bitmap.height)
      putInt("sourceOrientation",orientation);putInt("orientation",1);putInt("sampleSize",sample)
      putInt("sourceWidth",sourceWidth);putInt("sourceHeight",sourceHeight);putDouble("fileSize",file.length().toDouble())
      putString("encoding",if(jpeg)"jpeg_quality_97" else "png_lossless")
      putArray("steps",Arguments.createArray().apply{
       pushString("benchmark_only");if(orientation!=1)pushString("exif_orientation_$orientation")
       if(sample>1)pushString("memory_downsample_$sample")
       if(region!=null)pushString(if(name=="padded_roi_png")"manual_roi_padding_10_percent_each_side" else "manual_roi")
       pushString(if(jpeg)"jpeg_quality_97" else "png_lossless")
      })
      if(region!=null)putMap("pixelCrop",Arguments.createMap().apply{
       putInt("originX",region[0]);putInt("originY",region[1]);putInt("width",region[2]);putInt("height",region[3])
      })
      putMap("sourceCrop",Arguments.createMap().apply{
       putDouble("originX",x);putDouble("originY",y);putDouble("width",width);putDouble("height",height)
      })
     }
    }
    val outputs=Arguments.createMap()
    outputs.putMap("whole_png",output(image,"whole_png",false,null))
    val roi=cut(exact)
    outputs.putMap("roi_png",output(roi,"roi_png",false,exact))
    outputs.putMap("roi_jpeg",output(roi,"roi_jpeg",true,exact))
    // Recycle each crop before allocating the next; preserve decodeBounded's heap margin.
    if(roi!==image){roi.recycle();cropped.remove(roi)}
    val paddedRoi=cut(padded)
    outputs.putMap("padded_roi_png",output(paddedRoi,"padded_roi_png",false,padded))
    promise.resolve(outputs)
   }catch(error:OutOfMemoryError){files.forEach{it.delete()};promise.reject("IMAGE_MEMORY_LIMIT","Image too large for benchmark",error)}
    catch(error:Exception){files.forEach{it.delete()};promise.reject("IMAGE_BENCHMARK_FAILED",error)}
   finally{cropped.distinct().forEach{it.recycle()};if(upright!==decoded)upright?.recycle();decoded?.recycle()}
  }
 }
 // Explicit A/B candidate only: never choose it automatically or discard the color image.
 @ReactMethod fun createOcrVariant(uri:String,promise:Promise){
  imageWorker.execute {
   var decoded:Bitmap?=null
   var variant:Bitmap?=null
   try {
    val orientation=openImage(uri).use{ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION,1)}
    require(orientation !in 2..8){"Normalize image orientation before creating an OCR variant"}
    val (bitmap,sample)=decodeBounded(uri)
    decoded=bitmap
    val output=Bitmap.createBitmap(bitmap.width,bitmap.height,Bitmap.Config.ARGB_8888)
    variant=output
    val matrix=ColorMatrix().apply{setSaturation(0f)}
    val contrast=1.1f
    val offset=128f*(1f-contrast)
    matrix.postConcat(ColorMatrix(floatArrayOf(
     contrast,0f,0f,0f,offset,0f,contrast,0f,0f,offset,
     0f,0f,contrast,0f,offset,0f,0f,0f,1f,0f)))
    val paint=Paint().apply{colorFilter=ColorMatrixColorFilter(matrix)}
    Canvas(output).drawBitmap(bitmap,0f,0f,paint)
    val file=saveJpeg(output,"ocr-gray-")
    promise.resolve(Arguments.createMap().apply {
     putString("uri",Uri.fromFile(file).toString());putInt("width",output.width);putInt("height",output.height)
     putInt("sourceOrientation",1);putInt("orientation",1)
     putArray("steps",Arguments.createArray().apply{
      pushString("experimental_grayscale");pushString("experimental_contrast_1.1")
      if(sample>1)pushString("memory_downsample_$sample")
      pushString("jpeg_quality_97")
     })
    })
   }catch(error:OutOfMemoryError){promise.reject("IMAGE_MEMORY_LIMIT","Image too large for this device",error)}
    catch(error:Exception){promise.reject("IMAGE_VARIANT_FAILED",error)}
   finally{variant?.recycle();decoded?.recycle()}
  }
 }
 @ReactMethod fun inspectImage(uri:String,promise:Promise){
  imageWorker.execute {
   var decoded:Bitmap?=null
   try {
    val size=bounds(uri)
    val (bitmap,_)=decodeBounded(uri)
    decoded=bitmap
    val step=maxOf(1,minOf(bitmap.width,bitmap.height)/220)
    var count=0L;var bright=0L;var sum=0.0;var edge=0.0
    fun gray(x:Int,y:Int):Double {
     val color=bitmap.getPixel(x,y)
     return(color shr 16 and 255)*.299+(color shr 8 and 255)*.587+(color and 255)*.114
    }
    for(y in step until bitmap.height-step step step)for(x in step until bitmap.width-step step step){
     val value=gray(x,y);sum+=value;if(value>247)bright++
     edge+=kotlin.math.abs(4*value-gray(x-step,y)-gray(x+step,y)-gray(x,y-step)-gray(x,y+step));count++
    }
    val brightness=if(count>0)sum/count else 0.0
    val sharpness=if(count>0)edge/count else 0.0
    val overexposed=if(count>0)bright.toDouble()/count else 0.0
    // Uncalibrated capture hints, not an OCR confidence score or a reason to skip OCR.
    promise.resolve(Arguments.createMap().apply{
     putDouble("brightness",brightness);putDouble("sharpness",sharpness);putDouble("overexposedRatio",overexposed)
     putInt("width",size.outWidth);putInt("height",size.outHeight)
     putBoolean("tooDark",brightness<48);putBoolean("tooBright",brightness>225&&overexposed>.55)
     putBoolean("hasGlare",overexposed>.42&&brightness>190&&sharpness<7.0)
     putBoolean("tooBlurry",sharpness<5.0);putBoolean("tooSmall",size.outWidth<700||size.outHeight<500)
    })
   }catch(error:OutOfMemoryError){promise.reject("IMAGE_MEMORY_LIMIT","Image too large for this device",error)}
    catch(error:Exception){promise.reject("IMAGE_INSPECT_FAILED",error)}
   finally{decoded?.recycle()}
  }
 }
}
