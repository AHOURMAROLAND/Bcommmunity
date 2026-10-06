from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("discussions", "0002_message_duree_vocale_message_en_reponse_a_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="forme_onde",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
