"""Ejemplo de cliente backend de Jev. Sin --live muestra una respuesta SIMULADA.

No autoriza pedidos, modifica inventario ni envía órdenes. No depende de paquetes.
Una llamada real requiere TYPESAFE_API_KEY en el entorno y ejecutar --live.
"""
from pathlib import Path
import argparse, json, math, os, sys, urllib.request, urllib.error

ROOT=Path(__file__).resolve().parent
ENDPOINT='https://api.typesafe.ai/v1/systemone'

def validate_response(request, response):
    answers=response.get('answers',{})
    for key,question in request['questions'].items():
        answer=answers.get(key)
        if not isinstance(answer,dict) or answer.get('type')!=question['type']:
            raise ValueError('Respuesta incompleta o tipo incorrecto: '+key)
        if question['type']=='choice':
            labels=set(question['criteria']); probs=answer.get('probabilities',{})
            if set(probs)!=labels or answer.get('choice') not in labels:
                raise ValueError('Opciones distintas del contrato: '+key)
            if not all(isinstance(p,(int,float)) and math.isfinite(p) and 0<=p<=1 for p in probs.values()):
                raise ValueError('Probabilidades inválidas: '+key)
            if abs(sum(probs.values())-1)>0.002:
                raise ValueError('Probabilidades no suman uno: '+key)
            top=max(probs.values())
            if abs(probs[answer['choice']]-top)>0.002:
                raise ValueError('La elección no corresponde a la mayor probabilidad: '+key)
            confidence=answer.get('confidence')
            if not isinstance(confidence,(int,float)) or not math.isfinite(confidence) or not 0<=confidence<=1:
                raise ValueError('Confianza inválida: '+key)
        elif question['type']=='noul':
            p=answer.get('noul')
            if not isinstance(p,(int,float)) or not math.isfinite(p) or not 0<=p<=1:
                raise ValueError('Noul inválido: '+key)
    return response

def evaluate(request):
    key=os.environ.get('TYPESAFE_API_KEY','').strip()
    if not key: raise ValueError('Falta TYPESAFE_API_KEY en el entorno del backend.')
    body=json.dumps(request,ensure_ascii=False).encode('utf-8')
    req=urllib.request.Request(ENDPOINT,data=body,method='POST',headers={
        'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=8) as r:
        response=json.loads(r.read())
    return validate_response(request,response)

def review_proposal(response):
    # Umbrales FICTICIOS iniciales; validar con casos en español antes de depender de ellos.
    # Aunque supere el umbral, el administrador mantiene la aprobación del pedido.
    urgent=response['answers']['urgency']
    uncertain=any(a['confidence']<0.80 for a in response['answers'].values() if a['type']=='choice')
    return {'suggested_priority':urgent['choice'],'review_required':True,
        'review_reason':'Baja confianza o contexto ambiguo' if uncertain else 'La política demo exige aprobación humana',
        'approval_granted':False,'inventory_changed':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true',help='Consumir la API real usando la clave del entorno.')
    parser.add_argument('--input',type=Path,default=ROOT/'jev_solicitud_ejemplo.json')
    args=parser.parse_args()
    request=json.loads(args.input.read_text(encoding='utf-8'))
    try:
        if args.live:
            response=evaluate(request); provenance='API_REAL'
        else:
            demo=json.loads((ROOT/'jev_respuesta_SIMULADA.json').read_text(encoding='utf-8'))
            response=validate_response(request,demo['response']); provenance=demo['provenance']
        print(json.dumps({'provenance':provenance,'response':response,'proposal':review_proposal(response)},ensure_ascii=False,indent=2))
    except urllib.error.HTTPError as error:
        print('Error HTTP de Jev: '+str(error.code)+'. Conservar revisión manual; no se autoriza ninguna acción.',file=sys.stderr)
        sys.exit(1)
    except (urllib.error.URLError,ValueError,KeyError,json.JSONDecodeError) as error:
        print('No se obtuvo una clasificación utilizable. Conservar revisión manual.',file=sys.stderr)
        sys.exit(1)
