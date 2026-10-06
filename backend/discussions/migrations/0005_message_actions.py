import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("discussions", "0004_message_client_id"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="epingle",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="message",
            name="message_origine",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="transferts",
                to="discussions.message",
            ),
        ),
        migrations.AddField(
            model_name="message",
            name="modifie_le",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="message",
            name="supprime_pour_tous",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="message",
            name="transfere",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="MessageFavori",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("cree_le", models.DateTimeField(auto_now_add=True)),
                (
                    "message",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="favoris",
                        to="discussions.message",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages_favoris",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["user", "-cree_le"], name="msgfav_user_created_idx"
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("message", "user"), name="message_favori_unique"
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="MessageMasque",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("cree_le", models.DateTimeField(auto_now_add=True)),
                (
                    "message",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="masques",
                        to="discussions.message",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages_masques",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["user", "message"], name="msgmask_user_msg_idx"
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("message", "user"), name="message_masque_unique"
                    ),
                ],
            },
        ),
    ]
