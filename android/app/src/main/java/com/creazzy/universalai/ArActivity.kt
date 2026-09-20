package com.creazzy.universalai

import android.app.Activity
import android.os.Bundle
import android.widget.FrameLayout
import com.scandit.datacapture.barcode.ar.capture.BarcodeAr
import com.scandit.datacapture.barcode.ar.capture.BarcodeArListener
import com.scandit.datacapture.barcode.ar.capture.BarcodeArSession
import com.scandit.datacapture.barcode.ar.ui.BarcodeArView
import com.scandit.datacapture.barcode.ar.ui.BarcodeArViewSettings
import com.scandit.datacapture.barcode.ar.ui.highlight.BarcodeArHighlightProvider
import com.scandit.datacapture.barcode.ar.ui.highlight.BarcodeArRectangleHighlight
import com.scandit.datacapture.barcode.data.Symbology
import com.scandit.datacapture.barcode.batch.data.TrackedBarcode
import com.scandit.datacapture.core.capture.DataCaptureContext
import com.scandit.datacapture.core.data.FrameData
import android.content.Context

class ArActivity : Activity(), BarcodeArListener {
    private lateinit var contextCapture: DataCaptureContext
    private lateinit var barcodeAr: BarcodeAr
    private lateinit var arView: BarcodeArView
    private val values=linkedSetOf<String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if(BuildConfig.SCANDIT_LICENSE_KEY.isBlank()){finish();return}
        contextCapture=DataCaptureContext.forLicenseKey(BuildConfig.SCANDIT_LICENSE_KEY)
        val settings=com.scandit.datacapture.barcode.ar.capture.BarcodeArSettings().apply{
            enableSymbology(Symbology.EAN13_UPCA,true)
            enableSymbology(Symbology.CODE128,true)
            enableSymbology(Symbology.QR,true)
        }
        barcodeAr=BarcodeAr(contextCapture,settings)
        barcodeAr.addListener(this)
        val container=FrameLayout(this)
        setContentView(container)
        arView=BarcodeArView(container,barcodeAr,contextCapture,BarcodeArViewSettings())
        arView.highlightProvider=object: BarcodeArHighlightProvider{
            override fun highlightForBarcode(context:Context, barcode:com.scandit.datacapture.barcode.data.Barcode, callback:BarcodeArHighlightProvider.Callback){
                callback.onData(BarcodeArRectangleHighlight(context,barcode))
            }
        }
        arView.start()
    }
    override fun onResume(){super.onResume();if(::arView.isInitialized)arView.onResume()}
    override fun onPause(){if(::arView.isInitialized)arView.onPause();super.onPause()}
    override fun onDestroy(){if(::arView.isInitialized)arView.onDestroy();barcodeAr.removeListener(this);super.onDestroy()}
    override fun onSessionUpdated(barcodeAr:BarcodeAr,session:BarcodeArSession,frameData:FrameData){
        val added: List<TrackedBarcode> = session.addedTrackedBarcodes
        val text=added.mapNotNull{it.barcode.data}.distinct()
        synchronized(values){values.addAll(text)}
    }
}
