import { handleVendorRfq } from "./vendor-rfq";
import { handleVendorDispute } from "./vendor-dispute";
import { handleCustomerPayment } from "./customer-payment";
import type { SimHandlerMap } from "./types";

export const simHandlers: SimHandlerMap = {
  "vendor.rfq": handleVendorRfq,
  "vendor.dispute": handleVendorDispute,
  "customer.payment": handleCustomerPayment,
};

export { generateVendorInvoice } from "./vendor-invoice";
export type { SimDeps, SimJob, SimJobHandler } from "./types";
