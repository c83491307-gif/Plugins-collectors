package com.creazzy.universalai

import android.app.Activity
import android.os.Bundle
import com.scandit.datacapture.barcode.batch.capture.BarcodeBatch
import com.scandit.datacapture.barcode.batch.capture.BarcodeBatchListener
import com.scandit.datacapture.barcode.batch.capture.BarcodeBatchSession
import com.scandit.datacapture.barcode.batch.data.TrackedBarcode
import com.scandit.datacapture.barcode.batch.ui.overlay.BarcodeBatchBasicOverlay
import com.scandit.datacapture.barcode.data.Symbology
import com.scandit.datacapture.core.capture.DataCaptureContext
import com.scandit.datacapture.core.data.FrameData
import com.scandit.datacapture.core.source.Camera
import com.scandit.datacapture.core.source.FrameSourceState
import com.scandit.datacapture.core.ui.DataCaptureView

class BatchActivity : Activity(), BarcodeBatchListener {
    private lateinit var contextCapture: DataCaptureContext
    private var camera: Camera? = null
    private lateinit var batch: BarcodeBatch
    private var values = linkedSetOf<String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.SCANDIT_LICENSE_KEY.isBlank()) { finish(); return }
        contextCapture = DataCaptureContext.forLicenseKey(BuildConfig.SCANDIT_LICENSE_KEY)
        val settings = com.scandit.datacapture.barcode.batch.capture.BarcodeBatchSettings().apply {
            enableSymbology(Symbology.EAN13_UPCA, true)
            enableSymbology(Symbology.EAN8, true)
            enableSymbology(Symbology.CODE128, true)
            enableSymbology(Symbology.CODE39, true)
            enableSymbology(Symbology.QR, true)
        }
        batch = BarcodeBatch.forDataCaptureContext(contextCapture, settings)
        batch.addListener(this)
        val view = DataCaptureView.newInstance(this, contextCapture)
        BarcodeBatchBasicOverlay.newInstance(batch, view)
        setContentView(view)
        camera = Camera.getDefaultCamera(BarcodeBatch.createRecommendedCameraSettings())
        contextCapture.setFrameSource(camera)
    }
    override fun onResume(){super.onResume();batch.isEnabled=true;camera?.switchToDesiredState(FrameSourceState.ON)}
    override fun onPause(){batch.isEnabled=false;camera?.switchToDesiredState(FrameSourceState.OFF);super.onPause()}
    override fun onDestroy(){batch.removeListener(this);contextCapture.removeCurrentMode();super.onDestroy()}
    override fun onSessionUpdated(mode: BarcodeBatch, session: BarcodeBatchSession, data: FrameData){
        val added=session.addedTrackedBarcodes.mapNotNull(TrackedBarcode::barcode).mapNotNull{it.data}
        synchronized(values){values.addAll(added)}
        if(values.isNotEmpty()) runOnUiThread {
            setResult(RESULT_OK, android.content.Intent().putExtra("barcode", values.joinToString(",")))
        }
    }
}
