import Product from "../../model/product/productUploadModel.js";
const productShowClint = async (req, res) => {
  const response = await Product.find({});
    res.send(response);
};
export { productShowClint };
