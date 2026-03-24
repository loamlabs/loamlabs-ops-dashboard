"use strict";(()=>{var e={};e.id=665,e.ids=[665],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},1309:e=>{e.exports=import("@supabase/supabase-js")},6249:(e,t)=>{Object.defineProperty(t,"l",{enumerable:!0,get:function(){return function e(t,a){return a in t?t[a]:"then"in t&&"function"==typeof t.then?t.then(t=>e(t,a)):"function"==typeof t&&"default"===a?t:void 0}}})},2902:(e,t,a)=>{a.a(e,async(e,n)=>{try{a.r(t),a.d(t,{config:()=>c,default:()=>u,routeModule:()=>l});var r=a(1802),s=a(7153),i=a(6249),o=a(7294),d=e([o]);o=(d.then?(await d)():d)[0];let u=(0,i.l)(o,"default"),c=(0,i.l)(o,"config"),l=new r.PagesAPIRouteModule({definition:{kind:s.x.PAGES_API,page:"/api/duplicate-product",pathname:"/api/duplicate-product",bundlePath:"",filename:""},userland:o});n()}catch(e){n(e)}})},7294:(e,t,a)=>{a.a(e,async(e,n)=>{try{a.r(t),a.d(t,{default:()=>d});var r=a(1309),s=e([r]);r=(s.then?(await s)():s)[0];let u=`${process.env.SHOPIFY_SHOP_NAME}.myshopify.com`;async function i(){let e=await fetch(`https://${u}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:process.env.SHOPIFY_CLIENT_ID,client_secret:process.env.SHOPIFY_CLIENT_SECRET,grant_type:"client_credentials"})});return(await e.json()).access_token}async function o(e,t={},a){return(await fetch(`https://${u}/admin/api/2024-01/graphql.json`,{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":a},body:JSON.stringify({query:e,variables:t})})).json()}async function d(e,t){if("POST"!==e.method)return t.status(405).json({error:"Method not allowed"});if(e.headers["x-dashboard-auth"]!==process.env.DASHBOARD_PASSWORD)return t.status(401).json({error:"Unauthorized"});let{productId:a,options:n}=e.body;if(!a)return t.status(400).json({error:"Missing productId"});let{newTitle:r,status:s,includeMedia:d}=n||{};try{let e=await i(),n=`
      mutation productDuplicate($newTitle: String!, $productId: ID!, $includeImages: Boolean, $newStatus: ProductStatus) {
        productDuplicate(newTitle: $newTitle, productId: $productId, includeImages: $includeImages, newStatus: $newStatus) {
          newProduct { id title handle variants(first: 100) { edges { node { id title sku } } } }
          userErrors { field message }
        }
      }
    `,u=await o(n,{productId:a,newTitle:r||"Cloned Hub - "+a,includeImages:d??!0,newStatus:s||"ACTIVE"},e);console.log("[DUPLICATE_DEBUG] Shopify Raw Response:",JSON.stringify(u,null,2));let c=u.data?.productDuplicate;if(!c)return t.status(500).json({error:"Shopify API returned no duplication data"});if(c?.userErrors?.length>0)return t.status(400).json({error:c.userErrors[0].message});let l=c.newProduct;if(!l)return t.status(500).json({error:"Shopify duplication succeeded but new product was not returned"});let p=`
      query getProductMeta($id: ID!) {
        product(id: $id) {
          metafields(first: 50) { edges { node { namespace key value type } } }
          variants(first: 100) {
            edges {
              node {
                title
                sku
                metafields(first: 50) { edges { node { namespace key value type } } }
              }
            }
          }
        }
      }
    `,f=await o(p,{id:a},e),m=f.data?.product;if(!m)return t.status(404).json({error:"Source product not found for metafield copy"});let h=[];if(m.metafields.edges.forEach(({node:e})=>{"shopify"!==e.namespace&&h.push({ownerId:l.id,namespace:e.namespace,key:e.key,value:e.value,type:e.type})}),m.variants.edges.forEach(({node:e})=>{let t=l.variants.edges.find(t=>t.node.title===e.title)?.node;t&&e.metafields.edges.forEach(({node:e})=>{"shopify"!==e.namespace&&h.push({ownerId:t.id,namespace:e.namespace,key:e.key,value:e.value,type:e.type})})}),h.length>0){let t=`
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key }
            userErrors { field message }
          }
        }
      `;for(let a=0;a<h.length;a+=25)await o(t,{metafields:h.slice(a,a+25)},e)}return t.status(200).json({success:!0,newProductId:l.id,newHandle:l.handle,message:`Product duplicated and ${h.length} metafields migrated.`})}catch(e){return console.error("Duplication Error:",e),t.status(500).json({error:e.message})}}n()}catch(e){n(e)}})},7153:(e,t)=>{var a;Object.defineProperty(t,"x",{enumerable:!0,get:function(){return a}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(a||(a={}))},1802:(e,t,a)=>{e.exports=a(145)}};var t=require("../../webpack-api-runtime.js");t.C(e);var a=t(t.s=2902);module.exports=a})();