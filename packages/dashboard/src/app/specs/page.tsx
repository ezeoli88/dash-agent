import { SpecListPage, CreateSpecDialog, SpecDetailDrawer } from '@/features/specs'

export default function SpecsPage() {
  return (
    <>
      <div className="animate-in fade-in duration-300">
        <SpecListPage />
      </div>
      <CreateSpecDialog />
      <SpecDetailDrawer />
    </>
  )
}
