from rest_framework.exceptions import PermissionDenied


class EmpresaViewMixin:
    """
    Mixin para ViewSets DRF: filtra por empresa, injeta na criação,
    e verifica permissão de módulo para papel 'operacional'.
    """
    modulo_nome = None

    def get_queryset(self):
        qs = super().get_queryset()
        empresa = getattr(self.request, 'empresa', None)
        if not empresa:
            return qs.none()
        return qs.filter(empresa=empresa)

    def perform_create(self, serializer):
        empresa = getattr(self.request, 'empresa', None)
        if not empresa:
            raise PermissionDenied('Nenhuma empresa ativa.')
        self._check_modulo()
        serializer.save(empresa=empresa)

    def perform_update(self, serializer):
        self._check_modulo()
        serializer.save()

    def _check_modulo(self):
        membro = getattr(self.request, 'membro', None)
        if self.modulo_nome and membro:
            if not membro.tem_acesso_modulo(self.modulo_nome):
                raise PermissionDenied(f"Sem permissão para o módulo '{self.modulo_nome}'.")
