package com.bakhita.community;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static final String APK_FILE_NAME = "bakhita-update.apk";
    private static final long MAX_APK_SIZE = 300L * 1024 * 1024;

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject result = new JSObject();
        result.put("authorized", hasInstallPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (hasInstallPermission()) {
            JSObject result = new JSObject();
            result.put("authorized", true);
            call.resolve(result);
            return;
        }
        try {
            Intent settings = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(settings);
            JSObject result = new JSObject();
            result.put("authorized", false);
            result.put("settingsOpened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Impossible d’ouvrir le réglage d’installation des applications.", error);
        }
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String urlValue = call.getString("url");
        String hashValue = call.getString("sha256");
        if (urlValue == null || hashValue == null || !hashValue.matches("(?i)[a-f0-9]{64}")) {
            call.reject("L’URL ou l’empreinte SHA-256 de l’APK est invalide.");
            return;
        }
        new Thread(() -> download(call, urlValue, hashValue.toLowerCase(Locale.ROOT))).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        if (!hasInstallPermission()) {
            call.reject("Autorisez d’abord l’installation de cette application dans les réglages Android.");
            return;
        }
        File apk = new File(getContext().getCacheDir(), APK_FILE_NAME);
        if (!apk.isFile()) {
            call.reject("Téléchargez d’abord la mise à jour.");
            return;
        }
        try {
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent installer = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            installer.setData(apkUri);
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(installer);
            call.resolve();
        } catch (Exception error) {
            call.reject("Le programme d’installation Android n’a pas pu être ouvert.", error);
        }
    }

    private boolean hasInstallPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void download(PluginCall call, String urlValue, String expectedHash) {
        File apk = new File(getContext().getCacheDir(), APK_FILE_NAME);
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlValue);
            if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getUserInfo() != null) {
                throw new IllegalArgumentException("Le téléchargement doit utiliser une URL HTTPS publique.");
            }
            connection = (HttpsURLConnection) url.openConnection();
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(30_000);
            connection.setInstanceFollowRedirects(false);

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("Le serveur de mise à jour a répondu " + status + ".");
            }
            long total = connection.getContentLengthLong();
            if (total > MAX_APK_SIZE) {
                throw new IllegalStateException("Le fichier APK dépasse la taille maximale autorisée.");
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long received = 0;
            long lastProgressAt = 0;
            int lastPercent = -1;
            byte[] buffer = new byte[32 * 1024];
            apk.delete();
            try (
                InputStream input = new BufferedInputStream(connection.getInputStream());
                FileOutputStream output = new FileOutputStream(apk)
            ) {
                int count;
                while ((count = input.read(buffer)) != -1) {
                    received += count;
                    if (received > MAX_APK_SIZE) {
                        throw new IllegalStateException("Le fichier APK dépasse la taille maximale autorisée.");
                    }
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                    int percent = total > 0 ? Math.min(100, (int) (received * 100 / total)) : -1;
                    long now = System.currentTimeMillis();
                    if (percent != lastPercent || now - lastProgressAt >= 250) {
                        JSObject progress = new JSObject();
                        progress.put("received", received);
                        progress.put("total", total);
                        progress.put("percent", percent);
                        notifyListeners("downloadProgress", progress);
                        lastPercent = percent;
                        lastProgressAt = now;
                    }
                }
            }
            String actualHash = toHex(digest.digest());
            if (!expectedHash.equals(actualHash)) {
                apk.delete();
                throw new SecurityException("L’empreinte de l’APK ne correspond pas au manifeste.");
            }
            JSObject result = new JSObject();
            result.put("fileName", APK_FILE_NAME);
            call.resolve(result);
        } catch (Exception error) {
            apk.delete();
            call.reject(error.getMessage() == null ? "Le téléchargement de l’APK a échoué." : error.getMessage(), error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String toHex(byte[] bytes) {
        StringBuilder output = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) output.append(String.format(Locale.ROOT, "%02x", value));
        return output.toString();
    }
}
