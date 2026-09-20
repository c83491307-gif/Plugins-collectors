package com.creazzy.universalai

import android.app.Activity
import android.os.Bundle
import android.widget.FrameLayout
import com.scandit.datacapture.barcode.count.capture.BarcodeCount
import com.scandit.datacapture.barcode.count.capture.BarcodeCountListener
import com.scandit.datacapture.barcode.count.capture.BarcodeCountSession
import com.scandit.datacapture.barcode.count.capture.BarcodeCountSessionSnapshot
import com.scandit.datacapture.barcode.count.capture.BarcodeCountSettings
import com.scandit.datacapture.barcode.count.ui.view.BarcodeCountView
import com.scandit.datacapture.barcode.count.ui.view.BarcodeCountViewUiListener
import com.scandit.datacapture.barcode.data.Barcode
import com.scandit.datacapture.barcode.data.Symbology
import com.scandit.datacapture.core.capture.DataCaptureContext
import com.scandit.datacapture.core.data.FrameData
import com.scandit.datacapture.core.source.Camera
import com.scandit.datacapture.core.source.FrameSourceState

class CountActivity : Activity(), BarcodeCountListener, BarcodeCountViewUiListener {
    private lateinit var contextCapture: DataCaptureContext
    private lateinit var camera: Camera
    private lateinit var count: BarcodeCount
    private lateinit var view: BarcodeCountView
    private var values: List<String> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.SCANDIT_LICENSE_KEY.isBlank()) { finish(); return }
        contextCapture = DataCaptureContext.forLicenseKey(BuildConfig.SCANDIT_LICENSE_KEY)
        camera = Camera.getDefaultCamera(BarcodeCount.createRecommendedCameraSettings())
        contextCapture.setFrameSource(camera)
        val settings = BarcodeCountSettings().apply {
            setSymbologyEnabled(Symbology.EAN13_UPCA, true)
            setSymbologyEnabled(Symbology.EAN8, true)
            setSymbologyEnabled(Symbology.UPCE, true)
            setSymbologyEnabled(Symbology.CODE128, true)
            setSymbologyEnabled(Symbology.CODE39, true)
            setSymbologyEnabled(Symbology.QR, true)
        }
        count = BarcodeCount.forDataCaptureContext(contextCapture, settings)
        count.addListener(this)
        val container = FrameLayout(this)
        setContentView(container)
        view = BarcodeCountView.newInstance(this, contextCapture, count)
        container.addView(view)
        view.uiListener = this
    }

    override fun onResume() { super.onResume(); camera.switchToDesiredState(FrameSourceState.ON) }
    override fun onPause() { camera.switchToDesiredState(FrameSourceState.OFF); super.onPause() }
    override fun onDestroy() { count.removeListener(this); contextCapture.removeCurrentMode(); super.onDestroy() }

    override fun onScan(barcodeCount: BarcodeCount, session: BarcodeCountSession, data: FrameData) {
        val found: List<Barcode> = session.recognizedBarcodes
        values = found.mapNotNull { it.data }.distinct()
    }
    override fun onListButtonTapped(view: BarcodeCountView, snapshot: BarcodeCountSessionSnapshot?) {
        values = snapshot?.recognizedBarcodes?.mapNotNull { it.data }?.distinct() ?: values
    }
    override fun onExitButtonTapped(view: BarcodeCountView, snapshot: BarcodeCountSessionSnapshot?) {
        values = snapshot?.recognizedBarcodes?.mapNotNull { it.data }?.distinct() ?: values
        setResult(RESULT_OK, android.content.Intent().putExtra("barcode", values.joinToString(",")))
        finish()
    }
}
