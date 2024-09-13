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
  } = data;
  const { uploadedImageURLs } = await req.body;
  const response = await Product.insertMany({
    ProductName,
    ProductPrice,
    ProductCategory,
    ProductLength,
    ProductWidth,
    ProductDescription,
    uploadedImageURLs,
  });
  res.json(response);
};
export default productUploadController;
