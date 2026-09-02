import type { DeliveryProvider } from '@/lib/delivery';

export type ConnectionFieldType = 'text' | 'password' | 'number' | 'select' | 'checkbox';

export type ConnectionField = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  type?: ConnectionFieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  storage: 'root' | 'config' | 'credentials' | 'pricing';
};

export type DeliveryConnectionSchema = {
  title: string;
  lead: string;
  docsHint: string;
  webhookHeader: string;
  identityFields: ConnectionField[];
  credentialFields: ConnectionField[];
  pricingFields: ConnectionField[];
  operationFields: ConnectionField[];
};

const COUNTRY_OPTIONS = [
  { value: 'AR', label: 'Argentina' },
  { value: 'UY', label: 'Uruguay' },
  { value: 'CL', label: 'Chile' },
  { value: 'CO', label: 'Colombia' },
  { value: 'MX', label: 'México' },
  { value: 'PE', label: 'Perú' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'BR', label: 'Brasil' },
];

export const DELIVERY_CONNECTION_SCHEMA: Record<DeliveryProvider, DeliveryConnectionSchema> = {
  rappi: {
    title: 'Conexión Rappi Partner API',
    lead: 'Store ID, país y credenciales OAuth de Rappi Developers. Campos exclusivos de Rappi.',
    docsHint: 'En Rappi Partners copiá Store ID, Client ID y Client Secret. El webhook recibe pedidos nuevos.',
    webhookHeader: 'X-Webhook-Secret',
    identityFields: [
      {
        key: 'storeExternalId',
        label: 'Store ID',
        placeholder: 'ID del local en Rappi Partners',
        required: true,
        storage: 'root',
      },
      {
        key: 'countryCode',
        label: 'País',
        type: 'select',
        options: COUNTRY_OPTIONS,
        required: true,
        storage: 'root',
      },
    ],
    credentialFields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'OAuth Client ID',
        required: true,
        storage: 'credentials',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        storage: 'credentials',
      },
    ],
    pricingFields: [
      {
        key: 'priceMarkupPercent',
        label: 'Margen extra %',
        type: 'number',
        help: 'Sobre el precio mostrador antes de compensar comisión.',
        storage: 'pricing',
      },
      {
        key: 'platformCommissionPercent',
        label: 'Comisión Rappi %',
        type: 'number',
        help: 'Según tu contrato. Se usa para calcular el precio en la app.',
        storage: 'pricing',
      },
    ],
    operationFields: [
      { key: 'prepMinutesDefault', label: 'Minutos de preparación', type: 'number', storage: 'root' },
      { key: 'autoAccept', label: 'Aceptar pedidos automáticamente', type: 'checkbox', storage: 'root' },
      { key: 'autoConfirmSale', label: 'Registrar venta al marcar listo', type: 'checkbox', storage: 'root' },
      { key: 'testMode', label: 'Modo prueba (sandbox)', type: 'checkbox', storage: 'pricing' },
    ],
  },
  pedidosya: {
    title: 'Conexión PedidosYa Partner API',
    lead: 'Chain ID, Vendor ID, país y credencial partner. Campos exclusivos de PedidosYa.',
    docsHint: 'En PedidosYa Partners: Chain ID, Restaurant/Vendor ID y API Key o usuario/contraseña.',
    webhookHeader: 'X-Webhook-Secret',
    identityFields: [
      {
        key: 'chainExternalId',
        label: 'Chain ID',
        placeholder: 'ID de cadena en PedidosYa',
        required: true,
        storage: 'root',
      },
      {
        key: 'storeExternalId',
        label: 'Vendor / Restaurant ID',
        placeholder: 'ID del local',
        required: true,
        storage: 'root',
      },
      {
        key: 'countryCode',
        label: 'País',
        type: 'select',
        options: COUNTRY_OPTIONS,
        required: true,
        storage: 'root',
      },
    ],
    credentialFields: [
      {
        key: 'apiKey',
        label: 'API Key / Partner Token',
        type: 'password',
        placeholder: 'Token principal de PedidosYa',
        help: 'Si tu cuenta usa usuario/contraseña, completá también Client ID y Secret abajo.',
        storage: 'credentials',
      },
      {
        key: 'clientId',
        label: 'Client ID / Usuario API',
        storage: 'credentials',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret / Contraseña API',
        type: 'password',
        storage: 'credentials',
      },
    ],
    pricingFields: [
      {
        key: 'priceMarkupPercent',
        label: 'Margen extra %',
        type: 'number',
        storage: 'pricing',
      },
      {
        key: 'platformCommissionPercent',
        label: 'Comisión PedidosYa %',
        type: 'number',
        storage: 'pricing',
      },
    ],
    operationFields: [
      { key: 'prepMinutesDefault', label: 'Minutos de preparación', type: 'number', storage: 'root' },
      { key: 'autoAccept', label: 'Aceptar pedidos automáticamente', type: 'checkbox', storage: 'root' },
      { key: 'autoConfirmSale', label: 'Registrar venta al marcar listo', type: 'checkbox', storage: 'root' },
      { key: 'testMode', label: 'Modo prueba (staging)', type: 'checkbox', storage: 'pricing' },
    ],
  },
};
