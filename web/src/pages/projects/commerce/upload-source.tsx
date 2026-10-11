import { HardDrive, Images } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";

export function UploadSource({ open, onClose, onLocal, onAssets }: { open: boolean; onClose: () => void; onLocal: () => void; onAssets: () => void }) {
    return (
        <AppModal open={open} title="添加产品图" centered footer={null} onCancel={onClose} width={520}>
            <p className="commerce-source-note">选择图片来源，添加同一商品的多角度图片</p>
            <div className="commerce-source-options">
                <button type="button" onClick={onLocal}>
                    <HardDrive aria-hidden />
                    <strong>本地上传</strong>
                    <span>从电脑或手机选择图片</span>
                </button>
                <button type="button" onClick={onAssets}>
                    <Images aria-hidden />
                    <strong>从资产选择</strong>
                    <span>使用素材库中已有的图片</span>
                </button>
            </div>
        </AppModal>
    );
}
