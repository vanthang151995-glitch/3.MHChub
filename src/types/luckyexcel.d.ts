declare module "luckyexcel" {
  interface TransformCallback {
    (exportJson: any, luckysheetfile: any): void;
  }
  interface ErrorCallback {
    (err: any): void;
  }
  const LuckyExcel: {
    transformExcelToLucky: (file: File, callback: TransformCallback, errorCallback?: ErrorCallback) => void;
  };
  export default LuckyExcel;
}
