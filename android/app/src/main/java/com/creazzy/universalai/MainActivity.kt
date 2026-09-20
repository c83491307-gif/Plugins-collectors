package com.creazzy.universalai

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private val prefs by lazy { getSharedPreferences("creazzy", MODE_PRIVATE) }

    private val scannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val value = result.data?.getStringExtra("barcode") ?: return@registerForActivityResult
        val script = "window.dispatchEvent(new MessageEvent('creazzy-barcode',{data:" + jsString(value) + "}));"
        webView.evaluateJavascript(script, null)
        Toast.makeText(this, "Barcode: " + value, Toast.LENGTH_SHORT).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        loadWorker()
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(9, 11, 16))
        }
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(12, 10, 12, 10)
        }
        val title = TextView(this).apply {
            text = "CREAZZY"
            setTextColor(Color.WHITE)
            textSize = 14f
            setPadding(4, 4, 12, 4)
        }
        val settings = Button(this).apply {
            text = "Worker"
            setOnClickListener { showWorkerDialog() }
        }
        val scan = Button(this).apply {
            text = "Scan"
            setOnClickListener {
                scannerLauncher.launch(Intent(this@MainActivity, ScannerHubActivity::class.java))
            }
        }
        toolbar.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        toolbar.addView(settings)
        toolbar.addView(scan)
        root.addView(toolbar)

        webView = WebView(this).apply {
            this.settings.javaScriptEnabled = true
            this.settings.domStorageEnabled = true
            this.settings.allowFileAccess = false
            this.settings.allowContentAccess = false
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(webView.settings, WebSettingsCompat.FORCE_DARK_OFF)
        }
        root.addView(webView, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
    }

    private fun loadWorker() {
        val url = prefs.getString("base_url", BuildConfig.DEFAULT_BASE_URL).orEmpty().trim()
        if (url.isBlank()) {
            showWorkerDialog()
            return
        }
        webView.loadUrl(if (url.endsWith("/")) url else url + "/")
    }

    private fun showWorkerDialog() {
        val input = EditText(this).apply {
            hint = "https://your-worker.workers.dev"
            setSingleLine(true)
            setText(prefs.getString("base_url", BuildConfig.DEFAULT_BASE_URL).orEmpty())
            setPadding(24, 18, 24, 18)
        }
        val wrapper = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(30, 8, 30, 0)
            addView(input)
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("Creazzy Worker")
            .setMessage("Enter the HTTPS Cloudflare Worker URL that hosts your Creazzy backend.")
            .setView(wrapper)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Connect", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val value = input.text.toString().trim()
                if (!value.startsWith("https://")) {
                    input.error = "Use an HTTPS Worker URL"
                    return@setOnClickListener
                }
                prefs.edit().putString("base_url", value).apply()
                dialog.dismiss()
                loadWorker()
            }
        }
        dialog.show()
    }

    private fun jsString(value: String): String = org.json.JSONObject.quote(value)
}
