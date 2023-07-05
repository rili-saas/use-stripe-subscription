import Stripe from "stripe";


export const stripeApiClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: null });


let products = null;
let subscription = null;


export const subscriptionHandler = async ({ customerId, query, body, label }) => {
  if (query.action === "useSubscription") {
    return await useSubscription({ customerId, label });
  }

  if (query.action === "redirectToCheckout") {
    return await redirectToCheckout({ customerId, body });
  }

  if (query.action === "redirectToCustomerPortal") {
    return await redirectToCustomerPortal({ customerId, body });
  }

  return { error: "Action not found" };
};


async function useSubscription({ customerId, label = '' }) {

  // https://stripe.com/docs/api/products/list
  products = await stripeApiClient.products.list({ active: true });
  products = products.data.filter(h => h.name.includes(label));
  products = await Promise.all(await products?.map(async product => {

    // https://stripe.com/docs/api/prices/list
    let prices = await stripeApiClient.prices.list({ product: product.id, active: true });

    return {
      product,
      prices: prices.data
    }

  }));

  subscription = await stripeApiClient.subscriptions.list({ customer: customerId });
  subscription = subscription.data.length <= 0 ? null : subscription;

  // console.log('useSubscription', subscription)

  return { products, subscription };
}

async function redirectToCustomerPortal({ customerId, body }) {

  // console.log('products', products);
  // console.log('subscription', subscription);


  // https://stripe.com/docs/api/customer_portal/configurations/create
  // https://stripe.com/docs/api/customer_portal/configurations/create#create_portal_configuration-features-subscription_cancel
  const configuration = await stripeApiClient.billingPortal.configurations.create({
    "features": {
      "customer_update": {
        "allowed_updates": [
          "email",
          "tax_id"
        ],
        "enabled": false
      },
      "invoice_history": {
        "enabled": true
      },
      "payment_method_update": {
        "enabled": true
      },
      "subscription_cancel": {
        "cancellation_reason": {
          "enabled": true,
          "options": ['too_expensive', 'missing_features', 'switched_service', 'unused', 'customer_service', 'too_complex', 'low_quality', 'other']
        },
        "enabled": true,
        // "mode": "at_period_end",
        "mode": "immediately",
        "proration_behavior": "none"
      },
      "subscription_pause": {
        "enabled": false
      },
      "subscription_update": {
        "default_allowed_updates": ["price"],
        "products": products.map(p => ({
          product: p.product.id,
          prices: p.prices.map(s => s.id)
        })),
        "enabled": true,
        "proration_behavior": "none"
      }
    },
    business_profile: {
      privacy_policy_url: 'https://example.com/privacy',
      terms_of_service_url: 'https://example.com/terms',
    },
  });

  return await stripeApiClient.billingPortal.sessions.create({
    customer: customerId,
    return_url: body.returnUrl,
    configuration: configuration.id
  });

}

async function redirectToCheckout({ customerId, body }) {

  return await stripeApiClient.checkout.sessions.create({
    customer: customerId,
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    line_items: [{ price: body.price, quantity: 1 }],
    mode: "subscription",
    allow_promotion_codes: true
  });

}


export const customerHasFeature = async ({ customerId, feature }) => {

  const customer = (await stripeApiClient.customers.retrieve(customerId, { expand: ["subscriptions"] })) as Stripe.Customer;

  let subscription = customer.subscriptions.data[0] || null;

  if (subscription) {
    subscription = await stripeApiClient.subscriptions.retrieve(
      subscription.id,
      { expand: ["items.data.price.product"] }
    );

    const features = (subscription.items.data[0].price.product as Stripe.Product).metadata.features;
    return features?.includes(feature);

  }

  return false;

};

















// async function useSubscription({ customerId }) {

//   // Retrieve products based on default billing portal config

//   // First, retrieve the configuration
//   const configurations = await stripeApiClient.billingPortal.configurations.list(
//     {
//       is_default: true,
//       expand: ["data.features.subscription_update.products"],
//     }
//   );

//   // Stripe doesn't let us expand as much as we'd like.
//   // Run this big mess to manually expand

//   // We preserve the order stripe returns things in
//   const products = new Array(
//     configurations.data[0].features.subscription_update.products.length
//   );

//   const pricePromises = configurations.data[0].features.subscription_update.products
//     .map((product, i) =>
//       product.prices.map(async (price, j) => {
//         const priceData = await stripeApiClient.prices.retrieve(price, {
//           expand: ["product"],
//         });
//         const cleanPriceData = {
//           ...priceData,
//           product: (priceData.product as Stripe.Product).id,
//         };
//         if (!products[i]) {
//           products[i] = {
//             product: priceData.product,
//             prices: new Array(product.prices.length),
//           };
//           products[i].prices[j] = cleanPriceData;
//         } else {
//           products[i].prices[j] = cleanPriceData;
//         }
//       })
//     )
//     .flat();

//   let subscription;
//   const subscriptionPromise = stripeApiClient.customers
//     .retrieve(customerId, { expand: ["subscriptions"] })
//     .then((customer) => {
//       // This package is limited to one subscription at a time
//       // @ts-ignore
//       subscription = customer.subscriptions.data[0] || null;
//     });

//   await Promise.all([...pricePromises, subscriptionPromise]);

//   return { products, subscription };
// }




// async function redirectToCheckout({ customerId, body }) {

//   const configurations = await stripeApiClient.billingPortal.configurations.list(
//     {
//       is_default: true,
//       expand: ["data.features.subscription_update.products"],
//     }
//   );

//   // console.log('configurations', configurations);

//   // Make sure the price ID is in here somewhere
//   let go = false;
//   for (let product of configurations.data[0].features.subscription_update.products) {
//     for (let price of product.prices) {
//       if (price === body.price) {
//         go = true;
//         break;
//       }
//     }
//   }

//   if (go) {
//     return await stripeApiClient.checkout.sessions.create({
//       customer: customerId,
//       success_url: body.successUrl,
//       cancel_url: body.cancelUrl,
//       line_items: [{ price: body.price, quantity: 1 }],
//       mode: "subscription",
//     });
//   }
//   return { error: "Error" };
// }
