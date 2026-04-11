ALTER TABLE `hubI18n`
ADD `subscriptionBenefits` text;

ALTER TABLE `hubI18n`
ADD `subscriptionBenefitsGen` integer NOT NULL DEFAULT 0;

ALTER TABLE `hubI18n`
ADD `privacyPolicyGen` integer NOT NULL DEFAULT 0;

ALTER TABLE `hubI18n`
ADD `termsOfServiceGen` integer NOT NULL DEFAULT 0;

UPDATE `hubI18n`
SET `subscriptionBenefits` = (
  SELECT `hub`.`subscriptionBenefits`
  FROM `hub`
  WHERE `hub`.`id` = `hubI18n`.`hubId`
)
WHERE EXISTS (
  SELECT 1
  FROM `hub`
  WHERE `hub`.`id` = `hubI18n`.`hubId`
    AND `hub`.`subscriptionBenefits` IS NOT NULL
);

ALTER TABLE `hub`
DROP COLUMN `subscriptionBenefits`;
