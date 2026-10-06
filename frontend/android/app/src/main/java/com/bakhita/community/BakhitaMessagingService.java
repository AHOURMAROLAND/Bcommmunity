package com.bakhita.community;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.UUID;

public class BakhitaMessagingService extends MessagingService {
    static final String CANAL_MESSAGES = "bakhita-messages";
    static final String EXTRA_REPONSE = "bakhita-reponse";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if (!MainActivity.isAppVisible()) afficherNotification(message);
    }

    private void afficherNotification(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (data.isEmpty()) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(
                CANAL_MESSAGES,
                "Messages Bakhita Community",
                NotificationManager.IMPORTANCE_HIGH
            ));
        }

        String tag = data.getOrDefault("tag", "bakhita-" + UUID.randomUUID());
        int notificationId = tag.hashCode() & 0x7fffffff;
        Intent ouvrir = new Intent(this, MainActivity.class);
        ouvrir.setAction("com.bakhita.community.OPEN_NOTIFICATION");
        ouvrir.putExtra("google.message_id", message.getMessageId() == null ? UUID.randomUUID().toString() : message.getMessageId());
        for (Map.Entry<String, String> entry : data.entrySet()) {
            ouvrir.putExtra(entry.getKey(), entry.getValue());
        }
        PendingIntent ouverture = PendingIntent.getActivity(
            this,
            notificationId,
            ouvrir,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CANAL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_bakhita)
            .setContentTitle(data.getOrDefault("titre", "Bakhita Community"))
            .setContentText(data.getOrDefault("corps", "Nouvelle notification"))
            .setContentIntent(ouverture)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setGroup(tag);

        String jeton = data.get("reply_token");
        String endpoint = data.get("reply_url");
        if (jeton != null && endpoint != null) {
            Intent repondre = new Intent(this, NotificationReplyReceiver.class);
            repondre.setAction("com.bakhita.community.REPLY");
            repondre.setData(android.net.Uri.parse("bakhita://reply/" + notificationId));
            repondre.putExtra("reply_token", jeton);
            repondre.putExtra("reply_url", endpoint);
            repondre.putExtra("notification_tag", tag);
            repondre.putExtra("notification_id", notificationId);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent reponsePendingIntent = PendingIntent.getBroadcast(
                this,
                notificationId,
                repondre,
                flags
            );
            RemoteInput saisie = new RemoteInput.Builder(EXTRA_REPONSE)
                .setLabel("Écrire une réponse")
                .build();
            notification.addAction(new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_bakhita,
                "Répondre",
                reponsePendingIntent
            ).addRemoteInput(saisie)
             .setAllowGeneratedReplies(true)
             .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
             .build());
        }

        manager.notify(tag, notificationId, notification.build());
    }
}
