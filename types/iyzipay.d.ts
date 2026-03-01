declare module 'iyzipay' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  class Iyzipay {
    constructor(config: { apiKey: string; secretKey: string; uri: string });
    payment: { create: (request: any, callback: (err: any, result: any) => void) => void };
    threedsInitialize: { create: (request: any, callback: (err: any, result: any) => void) => void };
    threedsPayment: { retrieve: (request: any, callback: (err: any, result: any) => void) => void };
    subMerchant: { create: (request: any, callback: (err: any, result: any) => void) => void };
    [key: string]: any;

    static LOCALE: { TR: string; EN: string; [key: string]: string };
    static CURRENCY: { TRY: string; USD: string; EUR: string; [key: string]: string };
    static PAYMENT_GROUP: { PRODUCT: string; LISTING: string; SUBSCRIPTION: string; [key: string]: string };
    static BASKET_ITEM_TYPE: { PHYSICAL: string; VIRTUAL: string; [key: string]: string };
    static PAYMENT_CHANNEL: { WEB: string; MOBILE: string; [key: string]: string };
  }
  export default Iyzipay;
}
