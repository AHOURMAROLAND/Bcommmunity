package com.bakhita.community;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class NotificationReplyReceiver extends BroadcastReceiver {
    private static final String TAG = "BakhitaReply";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle result = RemoteInput.getResultsFromIntent(intent);
        CharSequence texte = result == null ? null : result.getCharSequence(BakhitaMessagingService.EXTRA_REPONSE);
        String jeton = intent.getStringExtra("reply_token");
        String endpoint = intent.getStringExtra("reply_url");
        if (texte == null || texte.toString().trim().isEmpty() || jeton == null || endpoint == null) return;

        String reponse = texte.toString().trim();
        String tag = intent.getStringExtra("notification_tag");
        int notificationId = intent.getIntExtra("notification_id", 0);
        PendingResult resultat = goAsync();
        EXECUTOR.execute(() -> {
            boolean envoyee = false;
            HttpURLConnection connexion = null;
            try {
                URL url = new URL(endpoint);
                if (!"https".equalsIgnoreCase(url.getProtocol())
                    || url.getHost() == null
                    || url.getUserInfo() != null) {
                    throw new IllegalArgumentException("L'URL de réponse doit utiliser HTTPS.");
                }
                connexion = (HttpURLConnection) url.openConnection();
                connexion.setInstanceFollowRedirects(false);
                connexion.setRequestMethod("POST");
                connexion.setConnectTimeout(8000);
                connexion.setReadTimeout(8000);
                connexion.setDoOutput(true);
                connexion.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] corps = new JSONObject()
                    .put("jeton", jeton)
                    .put("texte", reponse)
                    .toString()
                    .getBytes(StandardCharsets.UTF_8);
                connexion.setFixedLengthStreamingMode(corps.length);
                try (OutputStream sortie = connexion.getOutputStream()) {
                    sortie.write(corps);
                }
                envoyee = connexion.getResponseCode() >= 200 && connexion.getResponseCode() < 300;
                if (!envoyee) Log.w(TAG, "La réponse push a échoué, code HTTP " + connexion.getResponseCode());
            } catch (Exception erreur) {
                Log.e(TAG, "Impossible d'envoyer la réponse push.");
            } finally {
                if (connexion != null) connexion.disconnect();
                afficherResultat(context, tag, notificationId, envoyee);
                resultat.finish();
            }
        });
    }

    private void afficherResultat(Context context, String tag, int id, boolean envoyee) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, BakhitaMessagingService.CANAL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_bakhita)
            .setContentTitle("Bakhita Community")
            .setContentText(envoyee ? "Réponse envoyée" : "Réponse non envoyée. Ouvrez l'application.")
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        manager.notify(tag, id, notification.build());
    }
}
