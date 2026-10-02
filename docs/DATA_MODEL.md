# 概念数据模型

当前只定义业务概念，不绑定具体数据库技术。

## Product 商品

- id
- name
- brand
- barcode
- specification
- manufacturer
- origin
- category

## PurchaseRecord 购买/持有记录

- id
- product_id
- purchase_date
- production_date
- expiry_date
- shelf_life
- storage_condition
- freshness_status
- photo_refs

## Nutrition 营养信息

- energy
- protein
- fat
- carbohydrate
- sugar
- added_sugar
- sodium
- serving_basis
- unit
- raw_text

## Ingredient 配料信息

- raw_text
- parsed_items
- allergens
- additives
- notes

## RecognitionRecord 识别记录

- id
- recognition_type
- source_image
- raw_result
- structured_result
- confidence
- network_enhanced
- user_confirmed
- created_at

## UserProfile 用户资料

MVP 只保留必要字段：
- age
- height
- weight

体检信息属于敏感数据，后续如实现必须单独设计隐私与授权机制。
