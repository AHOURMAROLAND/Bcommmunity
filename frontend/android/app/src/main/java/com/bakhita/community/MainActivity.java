package com.bakhita.community;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean appVisible;

    @Override
    public void onResume() {
        super.onResume();
        appVisible = true;
    }

    @Override
    public void onPause() {
        appVisible = false;
        super.onPause();
    }

    static boolean isAppVisible() {
        return appVisible;
    }
}
