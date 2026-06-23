// src/powerautomate/config.js

export const FLOWS = {
  rentals: process.env.PA_SEARCH_RENTALS_URL,
  customers: process.env.PA_SEARCH_CUSTOMERS_URL,
  models: process.env.PA_SEARCH_MODEL_URL,
  equipment: process.env.PA_SEARCH_EQUIPMENT_URL,
  currentRentals: process.env.PA_SEARCH_CURRENT_RENTALS_CCR_USERS,
  customerInfo: process.env.PA_SEARCH_CUSTOMER_INFO_DOOR
};