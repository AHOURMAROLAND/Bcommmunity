from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("notifications", "0002_alter_notification_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pushabonnement",
            name="type",
            field=models.CharField(
                choices=[("web", "Web"), ("fcm", "Fcm"), ("onesignal", "OneSignal")],
                max_length=9,
            ),
        ),
    ]
