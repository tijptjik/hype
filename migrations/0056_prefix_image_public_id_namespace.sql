-- Custom SQL migration file, put your code below! --
-- Prefix every image publicId with the hierarchical asset namespace.

UPDATE image
SET publicId = 'h/' || publicId
WHERE publicId NOT LIKE 'h/%';
