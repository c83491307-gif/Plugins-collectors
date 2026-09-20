package com.creazzy.universalai

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class ScannerHubActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 32, 28, 28)
        }
        root.addView(TextView(this).apply {
            text = "Creazzy Scanner Hub"
            textSize = 24f
            setPadding(0, 0, 0, 18)
        })
        root.addView(TextView(this).apply {
            text = "Choose the capture workflow. Licensed Scandit modes share the same native-to-web result contract."
            textSize = 14f
            setPadding(0, 0, 0, 18)
        })
        fun button(label:String, target:Class<*>) {
            root.addView(Button(this).apply {
                text=label
                setOnClickListener { startActivity(Intent(this@ScannerHubActivity,target)) }
            })
        }
        button("Barcode Capture", ScannerActivity::class.java)
        button("SparkScan — rapid single scan", SparkScanActivity::class.java)
        button("MatrixScan Count — bulk counting", CountActivity::class.java)
        button("MatrixScan Batch — multi tracking", BatchActivity::class.java)
        button("MatrixScan AR — highlights & annotations", ArActivity::class.java)
        setContentView(root)
    }
}
