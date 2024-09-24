import Product from "../../model/product/productUploadModel.js";
const productUploadController = async (req, res) => {
  const data = await req.body.infos;
  const {
    ProductName,
    ProductPrice,
    ProductCategory,
    ProductLength,
    ProductWidth,
    ProductDescription,
    pcs,
  } = data;
  const { uploadedImageURLs } = await req.body;
  const response = await Product.insertMany({
    ProductName,
    ProductPrice,
    ProductCategory,
    ProductLength,
    ProductWidth,
    ProductDescription,
    pcs,
    uploadedImageURLs,
  });
  res.json(response);
};
export default productUploadController;
