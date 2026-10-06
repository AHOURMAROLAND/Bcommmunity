from django.db import migrations, models


def garder_une_reaction_par_utilisateur(apps, schema_editor):
    ReactionMessage = apps.get_model("discussions", "ReactionMessage")
    doublons = (
        ReactionMessage.objects.values("message_id", "user_id")
        .annotate(dernier_id=models.Max("id"), nombre=models.Count("id"))
        .filter(nombre__gt=1)
    )
    for doublon in doublons.iterator():
        ReactionMessage.objects.filter(
            message_id=doublon["message_id"],
            user_id=doublon["user_id"],
        ).exclude(pk=doublon["dernier_id"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("discussions", "0005_message_actions"),
    ]

    operations = [
        migrations.RunPython(
            garder_une_reaction_par_utilisateur,
            migrations.RunPython.noop,
        ),
        migrations.RemoveConstraint(
            model_name="reactionmessage",
            name="reaction_unique",
        ),
        migrations.AddConstraint(
            model_name="reactionmessage",
            constraint=models.UniqueConstraint(
                fields=("message", "user"),
                name="reaction_unique",
            ),
        ),
    ]
