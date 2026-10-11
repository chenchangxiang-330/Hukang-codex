// Copyright (c) 2026 PaddlePaddle Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.paddle.ocr.postprocess

import com.paddle.ocr.model.OCRBox
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.hypot
import kotlin.math.max

object QuadTextCrop {
    private const val VERTICAL_CROP_RATIO = 1.5

    fun crop(src: Mat, box: OCRBox): Mat {
        // Align with PaddleX CropByPolys.get_minarea_rect_crop: recompute minAreaRect
        // from the detected quad before perspective transform.
        val rectPoints = box.points.map { Point(it.x.toDouble(), it.y.toDouble()) }
        val rectInput = MatOfPoint2f()
        // HuKang migration: release owned native buffers on exceptional exits too.
        val boundingBox = try {
            rectInput.fromList(rectPoints)
            Imgproc.minAreaRect(rectInput)
        } finally { rectInput.release() }

        val boxPoints = Array(4) { Point() }
        boundingBox.points(boxPoints)
        val ordered = QuadGeometry.orderMinAreaRectPoints(boxPoints)

        val widthTop = hypot(ordered[0].x - ordered[1].x, ordered[0].y - ordered[1].y)
        val widthBottom = hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y)
        val heightLeft = hypot(ordered[0].x - ordered[3].x, ordered[0].y - ordered[3].y)
        val heightRight = hypot(ordered[1].x - ordered[2].x, ordered[1].y - ordered[2].y)

        val dstW = max(widthTop, widthBottom).toInt().coerceAtLeast(1)
        val dstH = max(heightLeft, heightRight).toInt().coerceAtLeast(1)

        var srcPts: MatOfPoint2f? = null
        var dstPts: MatOfPoint2f? = null
        var m: Mat? = null
        var dst: Mat? = null
        var rotated: Mat? = null
        try {
            val sourcePoints = MatOfPoint2f(); srcPts = sourcePoints
            sourcePoints.fromList(ordered)
            val targetPoints = MatOfPoint2f(); dstPts = targetPoints
            targetPoints.fromList(listOf(Point(0.0, 0.0), Point(dstW.toDouble(), 0.0),
                Point(dstW.toDouble(), dstH.toDouble()), Point(0.0, dstH.toDouble())))
            val perspective = Imgproc.getPerspectiveTransform(sourcePoints, targetPoints); m = perspective
            val target = Mat(dstH, dstW, CvType.CV_8UC3); dst = target
            Imgproc.warpPerspective(src, target, perspective, Size(dstW.toDouble(), dstH.toDouble()),
                Imgproc.INTER_CUBIC, Core.BORDER_REPLICATE)
            if (target.rows().toDouble() / target.cols() >= VERTICAL_CROP_RATIO) {
                val result = Mat(); rotated = result
                Core.rotate(target, result, Core.ROTATE_90_COUNTERCLOCKWISE)
                rotated = null // ownership transfers to the caller
                return result
            }
            dst = null // ownership transfers to the caller
            return target
        } finally {
            srcPts?.release(); dstPts?.release(); m?.release(); dst?.release(); rotated?.release()
        }
    }
}
