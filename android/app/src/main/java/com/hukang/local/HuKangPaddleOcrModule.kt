package com.hukang.local

import ai.onnxruntime.OrtEnvironment
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.RectF
import android.os.SystemClock
import com.facebook.react.bridge.*
import com.paddle.ocr.EngineConfig
import com.paddle.ocr.PaddleOCRConfig
import com.paddle.ocr.engine.OCREngine
import org.opencv.core.Core
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.ceil
import kotlin.math.round

/** Separate local engine. An explicitly requested Paddle run never silently uses ML Kit. */
class HuKangPaddleOcrModule(private val context: ReactApplicationContext): ReactContextBaseJavaModule(context) {
  private val destroyed = AtomicBoolean(false)
  private val worker = Executors.newSingleThreadExecutor { task -> Thread(task, "HuKang-PaddleOCR") }
  private var engine: OCREngine? = null
  private var models: List<Map<String, Any>> = emptyList()
  override fun getName() = "HuKangPaddleOcr"

  override fun invalidate() {
    if (destroyed.compareAndSet(false, true)) {
      worker.execute { engine?.release(); engine = null }
      worker.shutdown()
    }
    super.invalidate()
  }

  private fun submit(promise: Promise, code: String, action: () -> Map<String, Any?>) {
    if (destroyed.get()) { promise.reject("OCR_MODULE_DESTROYED", "OCR module is no longer active"); return }
    try {
      worker.execute {
        try {
          check(!destroyed.get()) { "OCR module is no longer active" }
          val result = action()
          if (destroyed.get()) promise.reject("OCR_MODULE_DESTROYED", "OCR module is no longer active")
          else promise.resolve(Arguments.makeNativeMap(result))
        } catch (error: OutOfMemoryError) {
          promise.reject("OCR_MEMORY_LIMIT", "Image/model exceeds this device's memory", error)
        } catch (error: Throwable) { promise.reject(code, error.message ?: "Local OCR failed", error) }
      }
    } catch (error: RejectedExecutionException) { promise.reject("OCR_MODULE_DESTROYED", error) }
  }

  @ReactMethod fun fileEvidence(uri: String, promise: Promise) {
    submit(promise, "OCR_FILE_EVIDENCE_FAILED") { OcrFileEvidence(context).privateFile(uri) }
  }

  @ReactMethod fun recognizeDetailed(uri: String, promise: Promise) {
    submit(promise, "PADDLE_OCR_FAILED") { recognizeImage(uri) }
  }

  private fun recognizeImage(uri: String): Map<String, Any?> {
    val started = SystemClock.elapsedRealtime()
    val sampler = MemorySampler()
    var samplingFinished = false
    var bitmap: Bitmap? = null
    var upright: Bitmap? = null
    try {
      val store = OcrFileEvidence(context)
      val file = store.file(uri)
      val size = store.bounds(uri)
      val orientation = store.orientation(uri)
      // Same reference decode cap, with a stricter low-heap bound. No interpolation enlargement.
      val maxPixels = minOf(8_000_000L, Runtime.getRuntime().maxMemory() / 16)
      var sample = 1
      while (ceil(size.outWidth.toDouble() / sample) * ceil(size.outHeight.toDouble() / sample) > maxPixels ||
        ceil(maxOf(size.outWidth, size.outHeight).toDouble() / sample) > 4096) sample *= 2
      val decoded = store.open(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply {
        inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888
      }) } ?: throw IllegalArgumentException("Cannot decode OCR pixels")
      bitmap = decoded
      val step = orientationMatrix(orientation, decoded.width, decoded.height)
      val input = if (orientation == 1) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, step, true)
      upright = input
      val sourceToInput = Matrix().apply {
        setScale(decoded.width.toFloat() / size.outWidth, decoded.height.toFloat() / size.outHeight)
        postConcat(step)
      }
      val transform = FloatArray(9).also { sourceToInput.getValues(it) }.toList()
      val imageDecodeMs = SystemClock.elapsedRealtime() - started
      var modelLoadMs = 0L
      if (engine == null) {
        val loading = SystemClock.elapsedRealtime()
        models = verifyModels()
        System.loadLibrary("opencv_java4")
        engine = OCREngine(context, PaddleOCRConfig(), EngineConfig(numThreads = 2),
          detModelAsset = "$MODEL_DIRECTORY/detector.onnx", recModelAsset = "$MODEL_DIRECTORY/recognizer.onnx",
          recConfigAsset = "$MODEL_DIRECTORY/inference.yml")
        modelLoadMs = SystemClock.elapsedRealtime() - loading
      }
      val activeEngine = requireNotNull(engine)
      val result = activeEngine.run(input)
      val lines = result.results.mapIndexed { index, item ->
        require(item.confidence.isFinite() && item.confidence in 0f..1f) { "Invalid OCR confidence" }
        val points = item.box.points
        require(points.all { it.x.isFinite() && it.y.isFinite() }) { "Invalid OCR geometry" }
        mapOf("id" to "line-$index", "page" to 0, "text" to item.text,
          "confidence" to round(item.confidence.toDouble() * 10_000_000.0) / 10_000_000.0,
          "left" to points.minOf { it.x }, "top" to points.minOf { it.y },
          "right" to points.maxOf { it.x }, "bottom" to points.maxOf { it.y },
          "polygon" to points.map { mapOf("x" to it.x, "y" to it.y) })
      }
      val memory = sampler.finish(); samplingFinished = true
      val nativeDuration = SystemClock.elapsedRealtime() - started
      return mapOf("engine" to "paddle", "provider" to "paddle-pp-ocrv5-mobile-onnx-cpu",
        "text" to result.results.joinToString("\n") { it.text }, "lines" to lines,
        "imageUri" to uri, "imageSha256" to file["sha256"], "imageBytes" to file["bytes"],
        "width" to input.width, "height" to input.height,
        "inputImage" to mapOf("width" to input.width, "height" to input.height, "sourceWidth" to size.outWidth,
          "sourceHeight" to size.outHeight, "sampleSize" to sample, "sourceOrientation" to orientation,
          "coordinateSpace" to "upright_decoded_bitmap_pixels", "sourceToInputMatrix" to transform),
        "models" to models, "modelVersion" to "PP-OCRv5_mobile_det_onnx+PP-OCRv5_mobile_rec_onnx",
        "versions" to mapOf("onnxRuntime" to OrtEnvironment.getEnvironment().version, "opencv" to Core.VERSION,
          "opencvArtifact" to "4.5.3.0", "paddleOcr" to "v3.7.0-hukang.1", "paddleSourceCommit" to REFERENCE_COMMIT),
        "nativeDurationMs" to nativeDuration, "durationMs" to nativeDuration, "memory" to memory,
        "timings" to mapOf("imageDecodeMs" to imageDecodeMs, "modelLoadMs" to modelLoadMs,
          "modelColdLoadMs" to activeEngine.coldLoadTimeMs, "ocrMs" to result.totalTimeMs,
          "detPreprocessMs" to result.detPreprocessMs, "detInferenceMs" to result.detInferenceMs,
          "detPostprocessMs" to result.detPostprocessMs, "recPreprocessMs" to result.recPreprocessMs,
          "recInferenceMs" to result.recInferenceMs, "recPostprocessMs" to result.recPostprocessMs,
          "pipelineOverheadMs" to result.pipelineOverheadMs, "detInputShape" to result.detInputShape,
          "recInputShapes" to result.recInputShapes))
    } finally {
      if (!samplingFinished) sampler.finish()
      if (upright !== bitmap) upright?.recycle()
      bitmap?.recycle()
    }
  }

  private fun verifyModels(): List<Map<String, Any>> {
    val manifest = context.assets.open("$MODEL_DIRECTORY/manifest.json").bufferedReader().use { JSONObject(it.readText()) }
    val result = mutableListOf<Map<String, Any>>()
    for ((filename, expected) in EXPECTED_HASHES) {
      val digest = java.security.MessageDigest.getInstance("SHA-256")
      var bytes = 0L
      context.assets.open("$MODEL_DIRECTORY/$filename").use { stream ->
        val buffer = ByteArray(64 * 1024)
        while (true) { val count = stream.read(buffer); if (count < 0) break; bytes += count; digest.update(buffer, 0, count) }
      }
      val actual = digest.digest().joinToString("") { "%02x".format(it) }
      require(actual == expected) { "Bundled Paddle SHA-256 mismatch: $filename" }
      val kind = if (filename.startsWith("detector")) "detector" else "recognizer"
      val key = if (filename.endsWith(".onnx")) "sha256" else "configSha256"
      require(manifest.getJSONObject("models").getJSONObject(kind).getString(key) == expected) { "Model manifest mismatch: $filename" }
      result.add(mapOf("file" to "$MODEL_DIRECTORY/$filename", "sha256" to actual, "bytes" to bytes))
    }
    return result
  }

  companion object {
    private const val MODEL_DIRECTORY = "models/paddleocr/v5-mobile"
    private const val REFERENCE_COMMIT = "5af9d4a5e6cd3ee91e09e7adaf6921dfce696852"
    private val EXPECTED_HASHES = mapOf(
      "detector.onnx" to "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d",
      "recognizer.onnx" to "da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092",
      "detector.yml" to "98069072e1b6b37d727fd9d9f11725faa46d6ea0de012f2ed26caea011c37699",
      "inference.yml" to "5dfeb2777f6d0db8177d8128a8acfcf6e6276dc4ac73ea3bf0dc06d6a5e85d8e")

    private fun orientationMatrix(orientation: Int, width: Int, height: Int): Matrix = Matrix().apply {
      val values = when (orientation) {
        2 -> floatArrayOf(-1f,0f,0f,0f,1f,0f,0f,0f,1f)
        3 -> floatArrayOf(-1f,0f,0f,0f,-1f,0f,0f,0f,1f)
        4 -> floatArrayOf(1f,0f,0f,0f,-1f,0f,0f,0f,1f)
        5 -> floatArrayOf(0f,1f,0f,1f,0f,0f,0f,0f,1f)
        6 -> floatArrayOf(0f,-1f,0f,1f,0f,0f,0f,0f,1f)
        7 -> floatArrayOf(0f,-1f,0f,-1f,0f,0f,0f,0f,1f)
        8 -> floatArrayOf(0f,1f,0f,-1f,0f,0f,0f,0f,1f)
        else -> floatArrayOf(1f,0f,0f,0f,1f,0f,0f,0f,1f)
      }
      setValues(values)
      val bounds = RectF(0f,0f,width.toFloat(),height.toFloat()); mapRect(bounds); postTranslate(-bounds.left,-bounds.top)
    }
  }
}
