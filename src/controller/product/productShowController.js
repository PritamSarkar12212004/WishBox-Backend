import Product from "../../model/product/productUploadModel.js";
const productShowClint = async (req, res) => {
  const response = await Product.find({});
  console.log(response)
    res.send(response);
};
export { productShowClint };
