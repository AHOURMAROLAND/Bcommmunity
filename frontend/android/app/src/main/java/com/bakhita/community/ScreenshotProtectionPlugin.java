package com.bakhita.community;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenshotProtection")
public class ScreenshotProtectionPlugin extends Plugin {
    @PluginMethod
    public void setBlocked(PluginCall call) {
        boolean blocked = call.getBoolean("blocked", false);
        getActivity().runOnUiThread(() -> {
            if (blocked) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            call.resolve();
        });
    }
}
