package com.creazzy.universalai

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.scandit.datacapture.barcode.capture.BarcodeCapture
import com.scandit.datacapture.barcode.capture.BarcodeCaptureListener
import com.scandit.datacapture.barcode.capture.BarcodeCaptureSession
import com.scandit.datacapture.barcode.capture.BarcodeCaptureOverlay
import com.scandit.datacapture.barcode.data.Symbology
import com.scandit.datacapture.core.capture.DataCaptureContext
import com.scandit.datacapture.core.data.FrameData
import com.scandit.datacapture.core.source.Camera
import com.scandit.datacapture.core.source.FrameSourceState
import com.scandit.datacapture.core.ui.DataCaptureView

class ScannerActivity : Activity(), BarcodeCaptureListener {
    private lateinit var captureContext: DataCaptureContext
    private lateinit var barcodeCapture: BarcodeCapture
    private var camera: Camera? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.SCANDIT_LICENSE_KEY.isBlank()) {
            setResult(Activity.RESULT_CANCELED)
            finish()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 1001)
        }

        captureContext = DataCaptureContext.forLicenseKey(BuildConfig.SCANDIT_LICENSE_KEY)
        val settings = com.scandit.datacapture.barcode.capture.BarcodeCaptureSettings().apply {
            enableSymbology(Symbology.CODE128, true)
            enableSymbology(Symbology.CODE39, true)
            enableSymbology(Symbology.QR, true)
            enableSymbology(Symbology.EAN8, true)
            enableSymbology(Symbology.UPCE, true)
            enableSymbology(Symbology.EAN13_UPCA, true)
        }
        barcodeCapture = BarcodeCapture.forDataCaptureContext(captureContext, settings)
        barcodeCapture.addListener(this)

        val captureView = DataCaptureView.newInstance(this, captureContext)
        BarcodeCaptureOverlay.newInstance(barcodeCapture, captureView)
        setContentView(captureView)

        camera = Camera.getDefaultCamera()
        camera?.applySettings(BarcodeCapture.createRecommendedCameraSettings())
        captureContext.setFrameSource(camera)
    }

    override fun onResume() {
        super.onResume()
        if (::barcodeCapture.isInitialized) barcodeCapture.isEnabled = true
        camera?.switchToDesiredState(FrameSourceState.ON)
    }

    override fun onPause() {
        camera?.switchToDesiredState(FrameSourceState.OFF)
        if (::barcodeCapture.isInitialized) barcodeCapture.isEnabled = false
        super.onPause()
    }

    override fun onDestroy() {
        if (::barcodeCapture.isInitialized) barcodeCapture.removeListener(this)
        super.onDestroy()
    }

    override fun onObservationStarted(barcodeCapture: BarcodeCapture) = Unit
    override fun onObservationStopped(barcodeCapture: BarcodeCapture) = Unit
    override fun onSessionUpdated(barcodeCapture: BarcodeCapture, session: BarcodeCaptureSession, data: FrameData) = Unit

    override fun onBarcodeScanned(barcodeCapture: BarcodeCapture, session: BarcodeCaptureSession, data: FrameData) {
        val value = session.newlyRecognizedBarcode?.data ?: return
        barcodeCapture.isEnabled = false
        runOnUiThread {
            setResult(Activity.RESULT_OK, Intent().putExtra("barcode", value))
            finish()
        }
    }
}
