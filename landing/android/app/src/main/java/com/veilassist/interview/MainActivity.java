package com.veilassist.interview;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Theme.SplashScreen never dismisses on HyperOS unless this runs before super.onCreate.
        SplashScreen.installSplashScreen(this).setKeepOnScreenCondition(() -> false);
        registerPlugin(NvidiaParakeetPlugin.class);
        super.onCreate(savedInstanceState);
        applyWebViewDefaults();
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.post(this::applyWebViewDefaults);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        applyWebViewDefaults();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyWebViewDefaults();
    }

    private void applyWebViewDefaults() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setBackgroundColor(Color.parseColor("#0C0C0D"));
        // LAYER_TYPE_HARDWARE stays black after sleep on Xiaomi/HyperOS.
        webView.setLayerType(View.LAYER_TYPE_NONE, null);
        webView.setVisibility(View.VISIBLE);
        webView.setAlpha(1f);
    }
}
