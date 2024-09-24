import mongoose from "mongoose";
const productSchema = new mongoose.Schema(
  {
    ProductName: {
      type: String,
      required: true,
    },
    ProductPrice: {
      type: Number,
      required: true,
    },
    ProductCategory: {
      type: String,
      required: true,
    },
    ProductLength: {
      type: String,
      
    },
    ProductWidth: {
      type: String,
      
    },
    ProductDescription: {
      type: String,
      required: true,
    },
    uploadedImageURLs: {
      type: Array,
      required: true,
    },
    likes: {
      type: Array,
    },
    carts: {
      type: Array,
    },
    pcs: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);
const Product = mongoose.model("Product", productSchema);
export default Product;
