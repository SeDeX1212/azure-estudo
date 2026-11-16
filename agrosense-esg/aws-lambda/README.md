# AWS Lambda — avaliador de necessidade hídrica

Função Python 3.12 (`lambda_function.lambda_handler`) que recebe dados simulados de sensores e devolve a irrigação recomendada.
Resultado **demonstrativo**: parâmetros simulados, sem validação agronômica.

## Fórmula e parâmetros (topo de `lambda_function.py`)
```
déficit = max(0, umidade_ideal(cultura) − umidade_atual)
fator_temp = 1 + max(0, T − 25) × 0,03
L/m² = déficit × 0,25 × fator_temp          volume_total = L/m² × área
```
Umidades ideais simuladas: milho 60, soja 65, café 55, tomate 70 (%). Níveis: 0 = Nenhuma; < 3 Baixa; < 7 Moderada; ≥ 7 Alta (L/m²).

## Contrato
Entrada: `soil_moisture` (0–100), `temperature` (−10 a 60), `crop_type`, `area_m2` (> 0). Respostas: `200`, `400` (validação/JSON), `405`, `500`. Corpo de erro: `{"success":false,"error":{"code","message"}}`.

## Testes locais
```bash
cd aws-lambda && python -m unittest discover -s tests -v
```

## Deploy (AWS CLI v2; região de exemplo `sa-east-1`)
Pré-requisitos: conta AWS, AWS CLI configurada (`aws configure`), permissões para IAM e Lambda. Lambda possui nível gratuito, mas **confirme preços e limites na página oficial**; o uso pode gerar custos.

```bash
cd aws-lambda
# 1) Papel de execução (logs no CloudWatch)
cat > trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
aws iam create-role --role-name agrosense-lambda-role --assume-role-policy-document file://trust.json
aws iam attach-role-policy --role-name agrosense-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
# (aguarde ~10 s para o papel propagar)

# 2) Publicar o código
zip function.zip lambda_function.py
aws lambda create-function --function-name agrosense-irrigacao --runtime python3.12 \
  --handler lambda_function.lambda_handler --zip-file fileb://function.zip \
  --role arn:aws:iam::<ID_DA_CONTA>:role/agrosense-lambda-role --region sa-east-1 \
  --environment "Variables={ALLOWED_ORIGIN=http://localhost:8080}"

# 3) Function URL pública (auth NONE: apenas para teste acadêmico)
aws lambda create-function-url-config --function-name agrosense-irrigacao --auth-type NONE --region sa-east-1
aws lambda add-permission --function-name agrosense-irrigacao --statement-id public-url \
  --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE --region sa-east-1
# Contas/regiões recentes podem exigir também a permissão lambda:InvokeFunction para a URL; se receber 403, consulte a documentação oficial de Function URLs e adicione-a.
```
O comando `create-function-url-config` retorna `FunctionUrl` (use-a no `config.js`).

**CORS:** feito **no código** via variável `ALLOWED_ORIGIN` (lista separada por vírgulas). Deixe o CORS da própria Function URL **desativado** para não duplicar cabeçalhos. Para produção:
```bash
aws lambda update-function-configuration --function-name agrosense-irrigacao --region sa-east-1 \
  --environment "Variables={ALLOWED_ORIGIN=http://localhost:8080\,https://SEU-APP.vercel.app}"
```
(Se o shell reclamar da vírgula, use o console: Configuration → Environment variables.)

**Atualizar código:** `zip function.zip lambda_function.py && aws lambda update-function-code --function-name agrosense-irrigacao --zip-file fileb://function.zip --region sa-east-1`

**Logs:** `aws logs tail /aws/lambda/agrosense-irrigacao --follow --region sa-east-1` ou CloudWatch → Log groups.

## Teste do endpoint
```bash
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"soil_moisture":25,"temperature":32,"crop_type":"milho","area_m2":1000}'
```

## Limpeza
```bash
aws lambda delete-function-url-config --function-name agrosense-irrigacao --region sa-east-1
aws lambda delete-function --function-name agrosense-irrigacao --region sa-east-1
aws logs delete-log-group --log-group-name /aws/lambda/agrosense-irrigacao --region sa-east-1
aws iam detach-role-policy --role-name agrosense-lambda-role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name agrosense-lambda-role
```

## Segurança
Endpoint anônimo (`auth-type NONE`) é aceitável só para teste: qualquer pessoa com a URL pode invocá-lo e gerar custo. Para produção use IAM/Cognito/API Gateway com chave/WAF, limites de concorrência e alarmes de orçamento. O CORS não é mecanismo de autenticação.
