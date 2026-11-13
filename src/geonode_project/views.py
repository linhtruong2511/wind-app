import os
from django.conf import settings
from django.views.generic import TemplateView


class WindAppPortalView(TemplateView):
    template_name = "wind_management/app.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        dev_env = os.getenv("VITE_DEV_MODE")
        if dev_env is not None:
            context["vite_dev_mode"] = dev_env.lower() in ("true", "1", "yes")
        else:
            context["vite_dev_mode"] = getattr(settings, "DEBUG", False)
        return context
