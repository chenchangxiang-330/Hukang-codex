package com.hukang.local

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.InputStream
import java.security.MessageDigest

/** Local bytes only. Hashes identify the actual input file, never OCR text or a decoded bitmap. */
internal class OcrFileEvidence(private val context: Context) {
  fun open(value: String): InputStream {
    val uri = Uri.parse(value)
    return when (uri.scheme) {
      null -> File(value).inputStream()
      "file" -> File(requireNotNull(uri.path)).inputStream()
      "content" -> context.contentResolver.openInputStream(uri)
        ?: throw IllegalArgumentException("Image is unavailable")
      else -> throw IllegalArgumentException("Only local file/content image URIs are allowed")
    }
  }

  fun bounds(uri: String): BitmapFactory.Options = BitmapFactory.Options().apply {
    inJustDecodeBounds = true
    open(uri).use { BitmapFactory.decodeStream(it, null, this) }
    require(outWidth > 0 && outHeight > 0) { "Cannot decode OCR image dimensions" }
  }

  fun orientation(uri: String): Int = open(uri).use {
    ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1)
  }.let { if (it in 1..8) it else 1 }

  fun file(uri: String): Map<String, Any> = open(uri).use { stream ->
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    var bytes = 0L
    while (true) {
      val count = stream.read(buffer)
      if (count < 0) break
      bytes += count
      require(bytes <= 64L * 1024 * 1024) { "OCR input exceeds the 64 MiB evidence limit" }
      digest.update(buffer, 0, count)
    }
    require(bytes > 0) { "Empty OCR image" }
    mapOf("sha256" to digest.digest().joinToString("") { "%02x".format(it) }, "bytes" to bytes)
  }

  // Persistent evidence uses app-owned files. It must not become an arbitrary path reader.
  fun privateFile(uri: String): Map<String, Any> {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "File evidence requires an app-private file URI" }
    val localFile = File(requireNotNull(parsed.path)).canonicalFile
    val allowed = listOf(context.filesDir.canonicalFile, context.cacheDir.canonicalFile)
      .any { root -> localFile.path.startsWith(root.path + File.separator) }
    require(allowed && localFile.isFile) { "File evidence is limited to app-private files/cache" }
    return file(uri)
  }
}
