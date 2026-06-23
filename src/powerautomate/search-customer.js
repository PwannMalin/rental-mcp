import { callFlow } from "./client.js";

export async function searchCustomer(filterQuery) {

  const data =
    await callFlow(
      process.env.PA_SEARCH_CUSTOMERS_URL,
      { filterQuery }
    );

  return data.value.map(c => ({

    customerNumber:
      c.CustomerNumber?.trim(),

    customerName:
      c.CustomerName?.trim(),

    branch:
      c.Branch?.trim(),

    deliveryAddressId:
      c.DeliveryAddressID,

    deliveryCity:
      c.DeliveryCity?.trim(),

    deliveryState:
      c.DeliveryState?.trim(),

    invoicingCustomer:
      c.InvoicingCustomer?.trim()

  }));
}