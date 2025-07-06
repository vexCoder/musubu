import DataSync from '@components/common/DataSync'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/welcome')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex">
      <video
        loop
        autoPlay
        muted
        src="/Video_Generation_Fine_Line_Art.mp4"
        className="fixed top-0 left-0 -z-10 h-full w-full scale-125 object-cover"
      />

      <div className="flex h-screen w-full flex-col items-center justify-center text-white">
        <DataSync />
      </div>
    </div>
  )
}
