-- Custom furni: World Cup Trophy (Furnibuilder)
-- Runs after the Arcturus base dump and the 3.0->3.5 migration on fresh init.
-- Idempotent: uses INSERT IGNORE so a redeploy with an existing volume is safe.

USE `arcturus`;

INSERT IGNORE INTO `items_base`
  (`id`, `sprite_id`, `public_name`, `item_name`, `type`, `width`, `length`, `stack_height`,
   `allow_stack`, `allow_sit`, `allow_lay`, `allow_walk`, `allow_gift`, `allow_trade`,
   `allow_recycle`, `allow_marketplace_sell`, `allow_inventory_stack`,
   `interaction_type`, `interaction_modes_count`, `vending_ids`, `multiheight`, `customparams`,
   `effect_id_male`, `effect_id_female`, `clothing_on_walk`)
VALUES
  (11769, 11769, 'World Cup Trophy', 'World_Cup_trophy', 's', 1, 1, 1.00,
   1, 0, 0, 0, 1, 1, 0, 1, 1,
   'default', 1, '0', '0', '',
   0, 0, '');

-- Catalog page 217 = 'sports' (default_3x3 layout). Free, owner-friendly placement.
INSERT IGNORE INTO `catalog_items`
  (`item_ids`, `page_id`, `catalog_name`, `cost_credits`, `cost_points`, `points_type`,
   `amount`, `limited_stack`, `limited_sells`, `order_number`, `offer_id`, `song_id`,
   `extradata`, `have_offer`, `club_only`)
VALUES
  ('11769', 217, 'World Cup Trophy', 5, 0, 0,
   1, 0, 0, 99, 11769, 0,
   '', '1', '0');
