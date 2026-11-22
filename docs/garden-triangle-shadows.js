import {BufferGeometry,Float32BufferAttribute,MeshBVH,MeshBVHUniformStruct,
  shaderStructs,shaderIntersectFunction} from './vendor/lantern-shadow-bvh.mjs';

const shader=`
  precision highp usampler2D;
  precision highp isampler2D;
  ${shaderStructs}
  ${shaderIntersectFunction.replace('float triangleDistance = INFINITY;', 'float triangleDistance = dist;')}
  uniform BVH riverTriangleTree;
  float shadowHit(vec3 origin,vec3 ray,float limit,bool anyHit){
    uvec4 face=uvec4(0u);
    vec3 normal=vec3(0.),barycentric=vec3(0.);
    float side=0.,distance=limit-.01;
    if(bvhIntersectFirstHit(riverTriangleTree,origin+ray*.01,ray,face,normal,barycentric,side,distance)){
      return distance+.01;
    }
    return limit;
  }
`;

export function triangleShadowSource(T,scene,materials){
  const matrix=new T.Matrix4(),world=new T.Matrix4(),bounds=new T.Box3();
  const points=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
  scene.updateMatrixWorld(true);
  const objects=scene.children.filter(object=>object.isMesh && materials.includes(object.material));
  for(const {geometry} of objects)if(!geometry.boundingBox)geometry.computeBoundingBox();
  return {
    shader,
    build(center,range,maxTextureSize){
      const positions=[];
      const extent=new T.Vector3(range,range,range);
      const region=new T.Box3(center.clone().sub(extent),center.clone().add(extent));
      for(const object of objects){
        const {geometry}=object,position=geometry.getAttribute('position'),index=geometry.index;
        const count=object.isInstancedMesh?object.count:1;
        for(let instance=0;instance<count;instance++){
          world.copy(object.matrixWorld);
          if(object.isInstancedMesh){
            object.getMatrixAt(instance,matrix);
            world.multiply(matrix);
          }
          if(!bounds.copy(geometry.boundingBox).applyMatrix4(world).intersectsBox(region))continue;
          for(let vertex=0;vertex<(index?index.count:position.count);vertex+=3){
            for(let corner=0;corner<3;corner++){
              const offset=vertex+corner;
              points[corner].fromBufferAttribute(position,index?index.getX(offset):offset).applyMatrix4(world);
            }
            if(bounds.setFromPoints(points).intersectsBox(region)){
              for(const {x,y,z} of points)positions.push(x,y,z);
            }
          }
        }
      }
      if(!positions.length)throw Error('No geometry near the moving lantern');
      const geometry=new BufferGeometry();
      geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
      const packed=new MeshBVHUniformStruct();
      packed.updateFrom(new MeshBVH(geometry));
      const textures={};
      for(const key of ['index','position','bvhBounds','bvhContents']){
        const {image,format,type,internalFormat}=packed[key];
        if(Math.max(image.width,image.height)>maxTextureSize)throw Error('Triangle shadows exceed the GPU texture limit');
        const texture=new T.DataTexture(image.data,image.width,image.height,format,type);
        texture.internalFormat=internalFormat;
        texture.needsUpdate=true;
        textures[key]=texture;
      }
      return textures;
    }
  };
}
