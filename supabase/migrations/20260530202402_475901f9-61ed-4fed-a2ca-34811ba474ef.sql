-- Allow admins to delete profiles (removes user from the app directory)
CREATE POLICY "Admins delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'Admin'::app_role));