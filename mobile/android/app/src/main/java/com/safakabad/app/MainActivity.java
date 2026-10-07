package com.safakabad.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The API can live on another domain (e.g. Render). Allow its login
        // cookie, which WebView blocks by default as a third-party cookie.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Keep the user signed in after the app is closed.
        CookieManager.getInstance().flush();
    }
}
