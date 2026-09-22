package com.hukang.local
import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import java.io.File
class HuKangOcrModule(private val context:ReactApplicationContext):ReactContextBaseJavaModule(context){
 override fun getName()="HuKangOcr"
 @ReactMethod fun recognize(uri:String,promise:Promise){try{val image=InputImage.fromFilePath(context,Uri.parse(uri));val client=TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build());client.process(image).addOnSuccessListener{client.close();promise.resolve(it.text)}.addOnFailureListener{client.close();promise.reject("OCR_FAILED",it)}}catch(e:Exception){promise.reject("OCR_IMAGE_FAILED",e)}}
 @ReactMethod fun inspectImage(uri:String,promise:Promise){try{val path=Uri.parse(uri).path?:uri;val file=File(path);if(!file.exists()||file.length()<=0)throw IllegalArgumentException("Empty image file");val bitmap=BitmapFactory.decodeFile(file.absolutePath)?:throw IllegalArgumentException("Cannot decode image");val step=maxOf(1,minOf(bitmap.width,bitmap.height)/220);var count=0L;var bright=0L;var sum=0.0;var edge=0.0;fun gray(x:Int,y:Int):Double{val c=bitmap.getPixel(x,y);return(c shr 16 and 255)*.299+(c shr 8 and 255)*.587+(c and 255)*.114};for(y in step until bitmap.height-step step step)for(x in step until bitmap.width-step step step){val c=gray(x,y);sum+=c;if(c>247)bright++;edge+=kotlin.math.abs(4*c-gray(x-step,y)-gray(x+step,y)-gray(x,y-step)-gray(x,y+step));count++};val brightness=if(count>0)sum/count else 0.0;val sharpness=if(count>0)edge/count else 0.0;val overexposed=if(count>0)bright.toDouble()/count else 0.0;val tooBright=brightness>225&&overexposed>.55;val glare=overexposed>.42&&brightness>190&&sharpness<7.0;val map=Arguments.createMap().apply{putDouble("brightness",brightness);putDouble("sharpness",sharpness);putDouble("overexposedRatio",overexposed);putInt("width",bitmap.width);putInt("height",bitmap.height);putBoolean("tooDark",brightness<48);putBoolean("tooBright",tooBright);putBoolean("hasGlare",glare);putBoolean("tooBlurry",sharpness<5.0);putBoolean("tooSmall",bitmap.width<700||bitmap.height<500)};bitmap.recycle();promise.resolve(map)}catch(e:Exception){promise.reject("IMAGE_INSPECT_FAILED",e)}}
}
