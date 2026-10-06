from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("discussions", "0003_message_forme_onde"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="client_id",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddConstraint(
            model_name="message",
            constraint=models.UniqueConstraint(
                condition=~models.Q(client_id=""),
                fields=("conversation", "auteur", "client_id"),
                name="message_client_id_unique",
            ),
        ),
    ]
