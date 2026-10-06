import json
from unittest.mock import patch

from django.http import HttpResponse
from django.middleware.security import SecurityMiddleware
from django.test import RequestFactory, SimpleTestCase, override_settings

from .sante import sante, vivant


class HealthEndpointTests(SimpleTestCase):
    def test_liveness_is_http_accessible_without_checking_dependencies(self):
        with patch("config.sante.connection") as database:
            response = vivant(RequestFactory().get("/api/vivant/"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {"ok": True})
        database.cursor.assert_not_called()

    def test_readiness_reports_database_and_redis(self):
        with (
            patch("config.sante.connection") as database,
            patch("config.sante.get_redis_connection") as get_redis,
            override_settings(REDIS_URL="redis://localhost:6379/0"),
        ):
            get_redis.return_value.ping.return_value = True
            response = sante(RequestFactory().get("/api/sante/"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {"bdd": True, "redis": True})
        database.cursor.return_value.__enter__.return_value.execute.assert_called_once_with("SELECT 1")

    @override_settings(
        SECURE_SSL_REDIRECT=True,
        SECURE_REDIRECT_EXEMPT=[r"^api/vivant/$", r"^api/sante/$"],
    )
    def test_health_routes_are_exempt_from_https_redirect(self):
        middleware = SecurityMiddleware(lambda request: HttpResponse())

        for path in ("/api/vivant/", "/api/sante/"):
            with self.subTest(path=path):
                self.assertIsNone(middleware.process_request(RequestFactory().get(path)))
