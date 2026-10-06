# Fidelización

Programa de puntos por negocio. Convive con el `Customer` de cuenta corriente: la credencial pública es `LoyaltyAccount` y el vínculo con `Customer` es opcional, solo si hay un único teléfono coincidente en el mismo tenant.

Fidelización funciona sin Wallet configurado.

## Economía

La configuración vive en `LoyaltyConfig` (una fila por `businessId`):

- `pointsPerArs` inicial: 10. 10 puntos = $1.
- `cashbackPercent` inicial: 5.
- Los puntos se guardan como enteros. El redondeo único es `floor` (`shared/loyalty-money.ts`).

Una carga de $10.000 acredita exactamente `arsCentsToPurchasedPoints` puntos comprados (100.000 con la tasa inicial). No hay comisión implícita.

El cashback de una venta es:

`floor(montoElegibleEnCentavos * cashbackPercent * pointsPerArs / 1_000_000)`

Con $10.000 y 5% son 5.000 puntos ganados.

El saldo que ve el cliente es uno solo (`balancePoints`). Internamente hay dos baldes:

- `purchasedPoints`: prepago (tipo `PURCHASED`).
- `freePoints`: regalados (`EARNED`, `BONUS`, ajuste positivo).

Al gastar se consumen primero los puntos gratuitos y después los comprados. El cashback nuevo se calcula sobre efectivo, tarjeta, transferencia, Mercado Pago y la parte pagada con puntos comprados. No genera cashback la parte pagada con puntos gratuitos, ni el fiado, ni la cuenta corriente.

Los puntos no vencen. Una reversión puede dejar el saldo negativo si el cliente ya gastó lo acreditado. Con saldo insuficiente no se puede canjear ni pagar.

## Ledger

`LoyaltyTransaction` es inmutable. Cada movimiento guarda `pointsDelta`, `purchasedDelta`, `freeDelta` y el equivalente en pesos. No se borran filas: una anulación crea `REVERSAL` (cashback) o `REFUND` (puntos gastados en la venta).

Claves de idempotencia por negocio:

- cashback de una venta: `sale:{id}:earn`
- canje en una venta: `sale:{id}:redeem`
- carga aprobada: `topup:{id}`
- premio: `reward:{redemptionId}`
- reversión: `reversal:{movementId}`

`balancePoints` de la cuenta es un caché actualizado dentro de la misma transacción que el movimiento, con `SELECT … FOR UPDATE`.

## Ventas y caja

`Sale` guarda `loyaltyAccountId`, `loyaltyPointsRedeemed`, `loyaltyArsRedeemed`, `loyaltyPointsEarned` y el modo pedido `fiscalMode` (`internal`, `factura_c` o `auto_mp`). El comprobante real sigue siendo `FiscalDocument`.

Si los puntos cubren toda la venta, `paymentMethod` queda en `puntos`. Si cubren una parte, `paymentMethod` es el medio del resto. La caja y los reportes por medio de pago usan `collectedForChannel`: el residual va a efectivo, banco o fiado; los puntos van a un bucket aparte y no suman dinero del turno.

El importe fiscal no se reduce por los puntos. Sigue siendo `totalFinal`.

### Modo Mercado Pago

En el POS, Mercado Pago es un modo fiscal (`auto_mp`), no un medio de pago.

- Comprobante interno y Factura C se respetan siempre.
- En Mercado Pago: efectivo, fiado, cuenta corriente y pago total con puntos generan comprobante interno. Débito, crédito, transferencia, Mercado Pago y el resto de medios electrónicos generan Factura C.
- En un pago mixto manda el medio del saldo que no se pagó con puntos.

## Portal y QR

Rutas públicas de la web:

- `/fidelidad/{publicSlug}` registro, saldo, fila, premios y compra de puntos.
- `/fidelidad/reclamar/{token}` acredita una venta una sola vez.
- `/fidelidad/recuperar` pide un enlace si hay email y el entorno no es producción con SMTP real. En producción sin correo, el mensaje pide un reset asistido.

API pública: `/public/loyalty/...`. La sesión es un token aleatorio (hash SHA-256 en `LoyaltySession`), cookie `HttpOnly` `sr_loyalty` y el mismo token en `sessionStorage` para orígenes distintos. No reutiliza el JWT del personal. El PIN de 4 a 6 dígitos se hashea con argon2. Ocho fallos bloquean 15 minutos. Login, registro y recuperación tienen límite de intentos.

El QR fijo del local no cambia entre ventas. Escanearlo crea un `LoyaltyCheckIn` `WAITING` de `checkInTtlMinutes` (8 por defecto). Solo puede haber uno activo por cuenta. El POS lo lista en “Clientes esperando puntos” y lo asocia a la venta actual.

Si la venta quedó sin cuenta, el historial ofrece “Mostrar QR de puntos”. El token se guarda hasheado y cifrado con `JWT_SECRET` para poder reimprimirlo mientras siga abierto. Al reclamar, un `updateMany` sobre estado `open` y venta sin cuenta evita la doble acreditación.

## Cargas, premios y reglas

Comprar puntos en el portal crea `LoyaltyTopupRequest` `PENDING`. Los puntos y la tasa quedan congelados. Confirmar pasa a `APPROVED` una sola vez y acredita `PURCHASED`. Rechazar guarda un motivo opcional. No hay cobro automático de Mercado Pago: el cliente transfiere a los datos de `LoyaltyConfig` (alias, CBU/CVU, titular, banco, instrucciones) e informa quién transfirió.

`LoyaltyReward` puede ser conceptual o estar ligado a un producto. El canje reserva stock, descuenta puntos y entrega un código. Entregar solo funciona desde `PENDING`. Cancelar antes de entregar reintegra los puntos con un movimiento opuesto.

`LoyaltyMilestoneRule` nace inactiva. Si se activa, otorga un bonus de puntos cada N ventas completadas de esa cuenta y no lo repite para la misma venta. Una venta anulada no dispara un premio nuevo.

## Administración

En StockRápido, Fidelización tiene resumen, clientes, cargas, premios, canjes, reglas, QR y configuración. OWNER y ADMIN configuran, ajustan puntos (con motivo, queda en `AuditLog`), aprueban cargas y crean premios. El cajero ve la fila, asocia la cuenta, usa puntos, muestra el QR de una venta y entrega canjes.

Un ajuste manual positivo suma puntos gratuitos. Uno negativo no deja el saldo en negativo. La reversión de una venta sí puede hacerlo.

## Wallets

`LoyaltyWalletService` genera el pase y la URL de Google después de que el movimiento de puntos ya está confirmado. Un fallo de Apple o Google se guarda en `walletSyncError` y no revierte la venta.

Apple Wallet arma un `.pkpass` store card (nombre del comercio, cliente, puntos, equivalente, QR con `publicToken`) y expone el web service en `/loyalty/apple/v1/...` para registro de dispositivos y pase actualizado. El push por APNs se intenta si hay clave.

Google Wallet crea o actualiza el loyalty object y devuelve un JWT `savetowallet`.

Si falta una variable, el estado del admin lista qué falta y el portal oculta el botón. Variables en `.env.example`:

- `APPLE_WALLET_ENABLED`, `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_TEAM_IDENTIFIER`
- `APPLE_WALLET_CERT`, `APPLE_WALLET_KEY`, `APPLE_WALLET_CERT_PASSWORD`, `APPLE_WALLET_WWDR_CERT`
- `APPLE_WALLET_APNS_KEY`, `APPLE_WALLET_APNS_KEY_ID`
- `GOOGLE_WALLET_ENABLED`, `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_CLASS_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_BASE64`

No guardar certificados ni la service account en la base ni en el repositorio.

## POS

La barra de puntos no reemplaza el cobro habitual. Muestra la fila, permite escanear el token público de la tarjeta, usar todo el saldo posible o un monto en puntos o pesos, y estima el cashback con `POST /loyalty/preview`. El servidor vuelve a calcular al guardar la venta. Si el saldo alcanza para toda la compra, “Cobrar con puntos” cierra sin otro medio.

El alta rápida de producto acepta silencioso y comisionado. La consignación la valida `ConsignmentService.assignProduct`.

## Datos demo

El seed crea configuración, dos cuentas y dos premios solo cuando el negocio se acaba de crear y todavía no tiene `LoyaltyConfig`.
