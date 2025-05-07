declare module '@/app/api/licenses/validate/route' {
    import { NextRequest } from 'next/server'
    export function POST(req: NextRequest): Promise<Response>
}

declare module '@/app/api/licenses/track-usage/route' {
    import { NextRequest } from 'next/server'
    export function POST(req: NextRequest): Promise<Response>
}