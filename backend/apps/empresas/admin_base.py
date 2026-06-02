from django.contrib import admin


class EmpresaModelAdmin(admin.ModelAdmin):
    """Admin base que filtra por empresa e preenche automaticamente."""

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        ids = request.user.empresas_membro.filter(
            ativo=True, papel__in=['admin', 'gerente']
        ).values_list('empresa_id', flat=True)
        return qs.filter(empresa_id__in=ids)

    def save_model(self, request, obj, form, change):
        if not change and not getattr(obj, 'empresa_id', None):
            membro = request.user.empresas_membro.filter(ativo=True).first()
            if membro:
                obj.empresa = membro.empresa
        super().save_model(request, obj, form, change)

    def get_list_display(self, request):
        display = list(super().get_list_display(request))
        if request.user.is_superuser and 'empresa' not in display:
            display.insert(0, 'empresa')
        return display

    def get_list_filter(self, request):
        filters = list(super().get_list_filter(request))
        if request.user.is_superuser and 'empresa' not in filters:
            filters.insert(0, 'empresa')
        return filters
