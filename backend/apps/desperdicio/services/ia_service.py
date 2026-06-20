import base64
import io
import json
import re

from django.conf import settings
from PIL import Image

PROMPT = (
    'Você é um especialista em identificação de pratos de buffet hoteleiro. '
    'Observe a foto e identifique o alimento/prato principal em português, de forma curta '
    '(ex: "Filé mignon grelhado", "Arroz branco", "Salada verde"). '
    'Responda APENAS com um JSON no formato {"alimento": "...", "confianca": 0.0} '
    'onde confianca é um número de 0 a 1 representando sua certeza na identificação.'
)


def _redimensionar(imagem_bytes: bytes, max_dim: int = 1024) -> bytes:
    img = Image.open(io.BytesIO(imagem_bytes))
    img = img.convert('RGB')
    img.thumbnail((max_dim, max_dim))
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=85)
    return buf.getvalue()


def classificar_foto(imagem_bytes: bytes) -> dict:
    """Identifica o alimento numa foto via Claude Vision. Nunca levanta exceção:
    em caso de erro, devolve confianca=0 para o operador preencher manualmente."""
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    if not api_key:
        return {'alimento': '', 'confianca': 0, 'erro': 'ANTHROPIC_API_KEY não configurada.'}

    try:
        import anthropic

        imagem_jpeg = _redimensionar(imagem_bytes)
        imagem_b64  = base64.b64encode(imagem_jpeg).decode('ascii')

        client = anthropic.Anthropic(api_key=api_key)
        modelo = getattr(settings, 'ANTHROPIC_VISION_MODEL', 'claude-haiku-4-5-20251001')

        resp = client.messages.create(
            model=modelo,
            max_tokens=200,
            messages=[{
                'role': 'user',
                'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': imagem_b64}},
                    {'type': 'text', 'text': PROMPT},
                ],
            }],
        )
        texto = resp.content[0].text.strip()
        # o modelo às vezes envolve em ```json ... ``` ou acrescenta texto antes/depois do objeto
        match = re.search(r'\{.*\}', texto, re.DOTALL)
        if not match:
            return {'alimento': '', 'confianca': 0, 'erro': f'Resposta sem JSON: {texto[:200]}'}

        dados = json.loads(match.group(0))
        return {
            'alimento':  str(dados.get('alimento', '')).strip(),
            'confianca': float(dados.get('confianca', 0) or 0),
        }
    except Exception as e:
        return {'alimento': '', 'confianca': 0, 'erro': str(e)}
