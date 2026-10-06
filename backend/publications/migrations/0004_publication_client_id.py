from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("publications", "0003_publication_image_hauteur_publication_image_largeur_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="publication",
            name="client_id",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddConstraint(
            model_name="publication",
            constraint=models.UniqueConstraint(
                condition=~models.Q(client_id=""),
                fields=("auteur", "client_id"),
                name="publication_client_id_unique",
            ),
        ),
    ]
