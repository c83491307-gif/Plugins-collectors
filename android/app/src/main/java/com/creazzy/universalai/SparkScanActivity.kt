package com.creazzy.universalai

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import com.scandit.datacapture.barcode.data.Symbology
import com.scandit.datacapture.barcode.spark.capture.SparkScan
import com.scandit.datacapture.barcode.spark.capture.SparkScanListener
import com.scandit.datacapture.barcode.spark.capture.SparkScanSession
import com.scandit.datacapture.barcode.spark.capture.SparkScanSettings
import com.scandit.datacapture.barcode.spark.ui.SparkScanView
import com.scandit.datacapture.barcode.spark.ui.SparkScanViewSettings
import com.scandit.datacapture.core.capture.DataCaptureContext
import com.scandit.datacapture.core.data.FrameData

class SparkScanActivity : Activity(), SparkScanListener {
    private lateinit var contextCapture: DataCaptureContext
    private lateinit var sparkScan: SparkScan
    private lateinit var view: SparkScanView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.SCANDIT_LICENSE_KEY.isBlank()) { finish(); return }
        contextCapture = DataCaptureContext.forLicenseKey(BuildConfig.SCANDIT_LICENSE_KEY)
        val settings = SparkScanSettings().apply {
            enableSymbologies(setOf(Symbology.EAN13_UPCA, Symbology.EAN8, Symbology.UPCE, Symbology.CODE128, Symbology.CODE39, Symbology.QR))
        }
        sparkScan = SparkScan(settings)
        sparkScan.addListener(this)
        view = SparkScanView.newInstance(
            findViewById<ViewGroup>(android.R.id.content),
            contextCapture,
            sparkScan,
            SparkScanViewSettings()
        )
    }

    override fun onResume() { super.onResume(); if (::view.isInitialized) view.onResume() }
    override fun onPause() { if (::view.isInitialized) view.onPause(); super.onPause() }
    override fun onDestroy() { if (::sparkScan.isInitialized) sparkScan.removeListener(this); super.onDestroy() }

    override fun onBarcodeScanned(sparkScan: SparkScan, session: SparkScanSession, data: FrameData?) {
        val value = session.newlyRecognizedBarcode?.data ?: return
        runOnUiThread {
            setResult(RESULT_OK, android.content.Intent().putExtra("barcode", value))
            finish()
        }
    }
}
